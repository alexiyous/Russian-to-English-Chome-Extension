// Auto Russian-English Translator Content Script
(function() {
    'use strict';

    let isTranslationActive = false;
    let translationEnabled = true;
    
    // Observer for detecting new content
    let contentObserver = null;
    
    // Debouncing variables for dynamic content
    let dynamicContentTimeout = null;
    let pendingNodes = new Set();
    
    // Check if an element contains Russian text
    function needsRetranslation(element) {
        const currentText = element.textContent || '';
        const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
        return russianPattern.test(currentText);
    }

    // Check if we should translate this page
    async function shouldTranslatePage() {
        try {
            const result = await chrome.storage.sync.get(['translationEnabled']);
            translationEnabled = result.translationEnabled !== false; // Default to true
            
            if (!translationEnabled) {
                return false;
            }

            // Check if page contains Russian text
            const textContent = document.body.textContent || document.body.innerText || '';
            // Enhanced pattern for Cyrillic detection including extended characters
            const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
            return russianPattern.test(textContent);
        } catch (error) {
            console.log('Auto Translator: Error checking translation settings:', error);
            return true; // Default to translating if we can't access storage
        }
    }

    // Direct text translation using Google Translate API with text chunking and error handling
    async function translateText(text, sourceLang = 'ru', targetLang = 'en') {
        const cleanText = text.trim();
        if (!cleanText) return '';
        
        // Maximum URL length limit for Google Translate API (increased for better performance)
        const MAX_CHUNK_SIZE = 4000; // Increased chunk size
        
        // If text is small enough, translate directly
        if (cleanText.length <= MAX_CHUNK_SIZE) {
            return await translateChunk(cleanText, sourceLang, targetLang);
        }
        
        // For large text, split into chunks and process in parallel
        const chunks = splitTextIntoChunks(cleanText, MAX_CHUNK_SIZE);
        
        // Process chunks in parallel with some concurrency control
        const maxConcurrent = Math.min(3, chunks.length); // Limit concurrent requests
        const translations = new Array(chunks.length);
        
        for (let i = 0; i < chunks.length; i += maxConcurrent) {
            const batch = chunks.slice(i, i + maxConcurrent);
            const batchPromises = batch.map((chunk, index) => 
                translateChunk(chunk, sourceLang, targetLang).then(result => ({
                    index: i + index,
                    translation: result
                }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(({ index, translation }) => {
                translations[index] = translation;
            });
            
            // Only add delay between batches, not individual chunks
            if (i + maxConcurrent < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay
            }
        }
        
        return translations.join(' ');
    }
    
    // Helper function to translate a single chunk with safe error handling
    async function translateChunk(text, sourceLang = 'ru', targetLang = 'en', isRetry = false) {
        const cleanText = text.trim();
        if (!cleanText) return '';
        
        // Prevent very long URLs that cause 400 errors
        const encodedText = encodeURIComponent(cleanText);
        if (encodedText.length > 8000) { // URL length limit
            return cleanText;
        }
        
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodedText}`;
            const response = await fetch(url);
            
            // Handle HTTP errors
            if (!response.ok) {
                if (response.status === 400) {
                    
                    // Only try splitting once to avoid recursion
                    if (!isRetry && cleanText.length > 500) {
                        // Split into smaller pieces and translate separately
                        const midPoint = Math.floor(cleanText.length / 2);
                        // Find a good split point (space, period, etc.)
                        let splitPoint = midPoint;
                        for (let i = midPoint; i < Math.min(midPoint + 100, cleanText.length); i++) {
                            if (/[\s.!?]/.test(cleanText[i])) {
                                splitPoint = i + 1;
                                break;
                            }
                        }
                        
                        const firstHalf = cleanText.substring(0, splitPoint).trim();
                        const secondHalf = cleanText.substring(splitPoint).trim();
                        
                        if (firstHalf && secondHalf) {
                            const [translation1, translation2] = await Promise.all([
                                translateChunk(firstHalf, sourceLang, targetLang, true),
                                translateChunk(secondHalf, sourceLang, targetLang, true)
                            ]);
                            return translation1 + ' ' + translation2;
                        }
                    }
                    
                    return cleanText;
                } else if (response.status === 429) {
                    console.log('Rate limited (429) - too many requests');
                    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
                    return cleanText;
                } else if (response.status === 503) {
                    console.log('Service unavailable (503)');
                    return cleanText;
                } else {
                    console.log('HTTP error:', response.status);
                    return cleanText;
                }
            }
            
            const result = await response.json();
            
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                return result[0][0][0];
            }
            
            console.log('Unexpected response structure');
            return cleanText;
        } catch (error) {
            console.log('Translation error:', error.message);
            // Handle network errors, JSON parsing errors, etc.
            return cleanText;
        }
    }
    
    // Helper function to split text into chunks at sentence boundaries when possible
    function splitTextIntoChunks(text, maxSize) {
        if (text.length <= maxSize) {
            return [text];
        }
        
        const chunks = [];
        let currentChunk = '';
        
        // Split by sentences first (periods, exclamation marks, question marks)
        const sentences = text.split(/([.!?]+\s+)/);
        
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            
            // If adding this sentence would exceed the limit
            if (currentChunk.length + sentence.length > maxSize) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // If individual sentence is too long, split by words
                if (sentence.length > maxSize) {
                    const words = sentence.split(' ');
                    let wordChunk = '';
                    
                    for (const word of words) {
                        if (wordChunk.length + word.length + 1 > maxSize) {
                            if (wordChunk.length > 0) {
                                chunks.push(wordChunk.trim());
                                wordChunk = '';
                            }
                            
                            // If individual word is still too long, force split
                            if (word.length > maxSize) {
                                for (let j = 0; j < word.length; j += maxSize) {
                                    chunks.push(word.substring(j, j + maxSize));
                                }
                            } else {
                                wordChunk = word;
                            }
                        } else {
                            wordChunk += (wordChunk ? ' ' : '') + word;
                        }
                    }
                    
                    if (wordChunk.length > 0) {
                        currentChunk = wordChunk;
                    }
                } else {
                    currentChunk = sentence;
                }
            } else {
                currentChunk += sentence;
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(chunk => chunk.length > 0);
    }

    // Helper function to identify if an element is a paragraph or block element
    function isBlockElement(element) {
        if (!element) return false;
        
        // Common block elements that might contain full paragraphs
        const blockTags = ['p', 'div', 'article', 'section', 'main', 'blockquote', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        
        return blockTags.includes(element.tagName.toLowerCase());
    }
    
    // Get all text content from an element
    function getAllTextContent(element) {
        if (!needsRetranslation(element)) return '';
        
        const textContent = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
        );
        
        let textNode;
        while (textNode = walker.nextNode()) {
            const text = textNode.textContent.trim();
            if (text.length > 0) textContent.push(text);
        }
        
        return textContent.join(' ');
    }
    
    // Check if an element contains Russian text
    function containsRussianText(element) {
        const text = getAllTextContent(element);
        if (text.length < 2) return false;
        
        // Enhanced pattern for Cyrillic detection
        const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
        return russianPattern.test(text);
    }
    
    // Translate all text nodes on the page with paragraph prioritization
    async function translatePageContent() {
        if (isTranslationActive) {
            return;
        }
        
        isTranslationActive = true;
        
        // Show translation indicator
        showTranslationIndicator();
        
        // First, find block elements with Russian text to translate as complete units
        const paragraphElements = [];
        const blockWalker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function(element) {
                    const tagName = element.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (!needsRetranslation(element)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check if it's a block element with Russian text
                    if (isBlockElement(element) && containsRussianText(element)) {
                        // Ensure it's not just a container for other block elements
                        let hasDirectRussianText = false;
                        for (let child of element.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
                                // Enhanced pattern for Cyrillic detection
                                const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                if (russianPattern.test(child.textContent)) {
                                    hasDirectRussianText = true;
                                    break;
                                }
                            }
                        }
                        
                        // Accept if it has direct text or is a leaf block
                        if (hasDirectRussianText || !Array.from(element.children).some(child => isBlockElement(child))) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                    
                    return NodeFilter.FILTER_SKIP; // Continue traversing
                }
            }
        );
        
        let blockElement;
        while (blockElement = blockWalker.nextNode()) {
            paragraphElements.push(blockElement);
        }
        

        
        // Now find individual text nodes that aren't part of the selected paragraphs
        const textNodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    if (!needsRetranslation(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if part of a paragraph we're already translating
                    let currentParent = parent;
                    while (currentParent) {
                        if (paragraphElements.includes(currentParent)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        currentParent = currentParent.parentElement;
                    }
                    
                    const text = node.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT;
                    
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        

        const paragraphBatchSize = 5;
        
        for (let i = 0; i < paragraphElements.length; i += paragraphBatchSize) {
            const batch = paragraphElements.slice(i, i + paragraphBatchSize);
            
            await Promise.all(batch.map(element => translateElementContent(element)));
            
            updateTranslationIndicator(`Translating... (${Math.min(i + paragraphBatchSize, paragraphElements.length)}/${paragraphElements.length} paragraphs)`);
            
            if (i + paragraphBatchSize < paragraphElements.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        

        
        const smallNodes = [];
        const regularNodes = [];
        
        textNodes.forEach(node => {
            const text = node.textContent.trim();
            if (text.length <= 5) {
                smallNodes.push(node);
            } else {
                regularNodes.push(node);
            }
        });
        
        const allNodes = [...regularNodes, ...smallNodes];
        const batchSize = 25;
        
        for (let i = 0; i < allNodes.length; i += batchSize) {
            const batch = allNodes.slice(i, i + batchSize);
            const translations = await Promise.all(
                batch.map(node => translateText(node.textContent.trim()))
            );
            
            batch.forEach((node, index) => {
                const originalText = node.textContent.trim();
                const translatedText = translations[index];
                if (translatedText && translatedText !== originalText) {
                    node.textContent = translatedText;
                }
            });
            
            if (i + batchSize < allNodes.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        await verifyTranslations();
        
        updateTranslationIndicator(`Translated ${paragraphElements.length} paragraphs and ${textNodes.length} text elements`);
        
        isTranslationActive = false;
        
        setTimeout(() => {
            checkForLateLoadingContent();
        }, 5000);
        
        setTimeout(() => {
            hideTranslationIndicator();
        }, 3000);

    }

    // Function to translate an entire element's content
    async function translateElementContent(element) {
        
        const allTextNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(textNode) {
                    const text = textNode.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT;
                    
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        let textNode;
        while (textNode = walker.nextNode()) {
            allTextNodes.push(textNode);
        }
        

        
        if (allTextNodes.length > 0) {
            const translations = await Promise.all(
                allTextNodes.map(node => translateText(node.textContent.trim()))
            );
            
            allTextNodes.forEach((node, index) => {
                const originalText = node.textContent.trim();
                const translatedText = translations[index];
                if (translatedText && translatedText !== originalText) {
                    node.textContent = translatedText;
                }
            });
        }
        
        return true;
    }

    // Setup MutationObserver to handle dynamic content
    function setupContentObserver() {
        if (contentObserver) {
            contentObserver.disconnect();
        }
        
        contentObserver = new MutationObserver((mutations) => {
            const nodesToProcess = new Set();
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            // Check if text node contains Russian text
                            const text = node.textContent.trim();
                            if (text.length >= 2) {
                                const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                if (russianPattern.test(text)) {
                                    nodesToProcess.add(node);
                                }
                            }
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            const textContent = node.textContent || '';
                            if (textContent.trim().length >= 2) {
                                const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                if (russianPattern.test(textContent)) {
                                    nodesToProcess.add(node);
                                }
                            }
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    const text = mutation.target.textContent.trim();
                    if (text.length >= 2) {
                        const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                        if (russianPattern.test(text)) {
                            nodesToProcess.add(mutation.target);
                        }
                    }
                }
            });
            
            // Add nodes to pending set and debounce processing
            nodesToProcess.forEach(node => pendingNodes.add(node));
            
            if (nodesToProcess.size > 0) {
                debouncedTranslateDynamicContent();
            }
        });
        
        contentObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
    
    // Debounced function to handle dynamic content translation
    function debouncedTranslateDynamicContent() {
        if (dynamicContentTimeout) {
            clearTimeout(dynamicContentTimeout);
        }
        
        dynamicContentTimeout = setTimeout(async () => {
            if (pendingNodes.size === 0) {
                return;
            }
            
            if (isTranslationActive) {
                debouncedTranslateDynamicContent();
                return;
            }
            
            const nodesToTranslate = Array.from(pendingNodes);
            pendingNodes.clear();
            
            // Separate elements and text nodes for better processing
            const elements = [];
            const textNodes = [];
            
            nodesToTranslate.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    elements.push(node);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    textNodes.push(node);
                }
            });
            
            for (const element of elements) {
                try {
                    if (needsRetranslation(element)) {
                        if (isBlockElement(element) && containsRussianText(element)) {
                            await translateElementContent(element);
                        } else {
                            const walker = document.createTreeWalker(
                                element,
                                NodeFilter.SHOW_TEXT,
                                {
                                    acceptNode: function(textNode) {
                                        const parent = textNode.parentElement;
                                        if (!parent || !needsRetranslation(parent)) {
                                            return NodeFilter.FILTER_REJECT;
                                        }
                                        
                                        const tagName = parent.tagName.toLowerCase();
                                        if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                                            return NodeFilter.FILTER_REJECT;
                                        }
                                        
                                        const text = textNode.textContent.trim();
                                        if (text.length < 2) return NodeFilter.FILTER_REJECT;
                                        
                                        const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                        return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                                    }
                                }
                            );
                            
                            const foundTextNodes = [];
                            let textNode;
                            while (textNode = walker.nextNode()) {
                                foundTextNodes.push(textNode);
                            }
                            
                            if (foundTextNodes.length > 0) {
                                await translateNewNodes(foundTextNodes);
                            }
                        }
                    }
                } catch (error) {
                    console.log("Error processing dynamic element:", error);
                }
            }
            
            const remainingTextNodes = textNodes.filter(node => {
                const parent = node.parentElement;
                return parent && needsRetranslation(parent) && !elements.some(el => el.contains(node));
            });
            
            if (remainingTextNodes.length > 0) {
                await translateNewNodes(remainingTextNodes);
            }
            

        }, 500);
    }


    
    // Function to translate a single text node
    async function translateSingleNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return false;
        
        const parent = node.parentElement;
        if (!parent) return false;
        
        // Skip if doesn't need retranslation
        if (!needsRetranslation(parent)) return false;
        
        const originalText = node.textContent.trim();
        if (originalText.length < 2) return false; // Skip very short text
        
        // Enhanced pattern for Cyrillic detection
        const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
        if (!russianPattern.test(originalText)) return false;
        
        try {
            // Check if this node is part of a paragraph
            let isPartOfParagraph = false;
            let paragraphElement = parent;
            
            // Check if any parent is a block element
            while (paragraphElement) {
                if (isBlockElement(paragraphElement)) {
                    isPartOfParagraph = true;
                    break;
                }
                paragraphElement = paragraphElement.parentElement;
            }
            
            // If part of a paragraph, translate the whole paragraph for better context
            if (isPartOfParagraph && paragraphElement) {
                await translateElementContent(paragraphElement);
                return true;
            } else {
                // Translate just this node
                const translatedText = await translateText(originalText);
                if (translatedText && translatedText !== originalText) {
                    node.textContent = node.textContent.replace(originalText, translatedText);
                    return true;
                }
            }
        } catch (error) {
            console.log("Error translating node:", error);
        }
        
        return false;
    }
    
    // Translate newly discovered nodes with optimized handling
    async function translateNewNodes(nodes) {
        // Sort nodes by content length to process larger, more meaningful text first
        const sortedNodes = [...nodes].sort((a, b) => {
            const aLength = (a.textContent || '').trim().length;
            const bLength = (b.textContent || '').trim().length;
            return bLength - aLength; // Larger texts first
        });
        
        const batchSize = 15; // Increased batch size
        for (let i = 0; i < sortedNodes.length; i += batchSize) {
            const batch = sortedNodes.slice(i, i + batchSize);
            await Promise.all(batch.map(node => translateSingleNode(node)));
            
            // Minimal delay for better performance
            if (i + batchSize < sortedNodes.length) {
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }
    }
    
    // Verification function to check for untranslated Russian text
    async function verifyTranslations() {
        updateTranslationIndicator("Verifying translations...");
        
        // Look for elements that still contain Russian text
        const incompleteElements = [];
        document.querySelectorAll('*').forEach(element => {
            const text = element.textContent || '';
            const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
            if (russianPattern.test(text)) {
                incompleteElements.push(element);
            }
        });
        
        if (incompleteElements.length > 0) {
            updateTranslationIndicator(`Fixing ${incompleteElements.length} incomplete translations...`);
            
            // Try to fix these elements with larger batches
            const batchSize = 8; // Increased batch size
            for (let i = 0; i < incompleteElements.length; i += batchSize) {
                const batch = incompleteElements.slice(i, i + batchSize);
                
                // For each element, retranslate with different approach
                await Promise.all(batch.map(async element => {
                    try {
                        // Get all text nodes with Russian text
                        const textNodes = [];
                        const walker = document.createTreeWalker(
                            element,
                            NodeFilter.SHOW_TEXT,
                            {
                                acceptNode: function(node) {
                                    const text = node.textContent.trim();
                                    if (text.length < 2) return NodeFilter.FILTER_REJECT;
                                    
                                    // Check for Russian text
                                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                                }
                            }
                        );
                        
                        let textNode;
                        while (textNode = walker.nextNode()) {
                            textNodes.push(textNode);
                        }
                        
                        // Translate all nodes in parallel for this element
                        const translations = await Promise.all(
                            textNodes.map(node => translateText(node.textContent.trim()))
                        );
                        
                        // Apply translations
                        textNodes.forEach((node, index) => {
                            const originalText = node.textContent.trim();
                            const translatedText = translations[index];
                            if (translatedText && translatedText !== originalText) {
                                node.textContent = node.textContent.replace(originalText, translatedText);
                            }
                        });
                    } catch (error) {
                        console.log("Error fixing incomplete translation:", error);
                    }
                }));
                
                // Reduced delay between batches
                if (i + batchSize < incompleteElements.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
        }
    }



    // Translation indicator UI
    function showTranslationIndicator() {
        // Create or get indicator element
        let indicator = document.getElementById('translation-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'translation-indicator';
            indicator.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background-color: rgba(65, 105, 225, 0.9);
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(indicator);
        }
        
        indicator.textContent = '🔄 Translating...';
        indicator.style.display = 'block';
    }
    
    function updateTranslationIndicator(message) {
        let indicator = document.getElementById('translation-indicator');
        if (indicator) {
            indicator.textContent = '🔄 ' + message;
        }
    }
    
    function hideTranslationIndicator() {
        let indicator = document.getElementById('translation-indicator');
        if (indicator) {
            indicator.style.opacity = '0';
            setTimeout(() => {
                indicator.style.display = 'none';
                indicator.style.opacity = '1';
            }, 1000);
        }
    }
    
    // Auto-translate page content directly
    async function autoTranslateToEnglish() {
        if (isTranslationActive) {
            return;
        }


        await translatePageContent();
    }



    // Initialize translation
    async function initializeTranslation() {
        try {
            const shouldTranslate = await shouldTranslatePage();
            if (!shouldTranslate) {
                return;
            }


            
            // Set up content observer immediately to catch dynamic content
            setupContentObserver();
            
            // Start direct translation after a short delay
            setTimeout(() => {
                autoTranslateToEnglish();
            }, 2000);
            
        } catch (error) {
            console.log('Auto Translator: Error initializing translation:', error);
        }
    }

    // Handle page refreshes and navigation
    function handlePageChange() {
        isTranslationActive = false;
        
        // Clear any pending dynamic content
        if (dynamicContentTimeout) {
            clearTimeout(dynamicContentTimeout);
        }
        pendingNodes.clear();
        
        // Disconnect existing observer
        if (contentObserver) {
            contentObserver.disconnect();
            contentObserver = null;
        }
        
        // Wait for page to load completely
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeTranslation);
        } else {
            // Page is already loaded
            setTimeout(initializeTranslation, 1000);
        }
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleTranslation') {
            translationEnabled = request.enabled;
            if (translationEnabled) {
                handlePageChange();
            } else {
                // Reload page to remove translation
                location.reload();
            }
            sendResponse({success: true});
        } else if (request.action === 'retranslate') {
            // Reset translation state
            isTranslationActive = false;
            
            // Since we're not storing original text anymore,
            // the simplest way to handle retranslation is to reload the page
            location.reload();
            return;
            
            sendResponse({success: true});
        }
    });

    // Start the translation process
    handlePageChange();

    // Throttled scroll handler
    let scrollTimeout;
    function handleScroll() {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
            if (translationEnabled && isTranslationActive) {
                // Check for any new untranslated Russian text in viewport
                checkForUntranslatedText();
            }
        }, 300); // 300ms throttle
    }

    // Check for late-loading content that may have appeared after initial translation
    function checkForLateLoadingContent() {
        
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if doesn't need retranslation
                    if (!needsRetranslation(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    const text = node.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT;
                    
                    // Enhanced pattern for Cyrillic detection
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        const lateNodes = [];
        let node;
        while (node = walker.nextNode()) {
            lateNodes.push(node);
        }
        
        if (lateNodes.length > 0) {
            translateNewNodes(lateNodes);
        }
    }

    // Check for untranslated Russian text in current viewport
    function checkForUntranslatedText() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if doesn't need retranslation
                    if (!needsRetranslation(parent)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check if element is in viewport
                    const rect = parent.getBoundingClientRect();
                    const isInViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100; // 100px buffer
                    
                    if (!isInViewport) return NodeFilter.FILTER_REJECT;
                    
                    const text = node.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT; // Reduced threshold
                    
                    // Enhanced pattern for Cyrillic detection including extended characters
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        const nodesToTranslate = [];
        let node;
        while (node = walker.nextNode()) {
            nodesToTranslate.push(node);
        }
        
        if (nodesToTranslate.length > 0) {
            translateNewNodes(nodesToTranslate);
        }
    }

    // Add scroll event listener
    if (translationEnabled) {
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll, { passive: true });
    }

    // Handle navigation changes (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(handlePageChange, 2000); // Delay for SPA navigation
        }
    }).observe(document, {subtree: true, childList: true});

    // Cleanup function
    function cleanup() {
        if (contentObserver) {
            contentObserver.disconnect();
        }
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        if (dynamicContentTimeout) {
            clearTimeout(dynamicContentTimeout);
        }
        pendingNodes.clear();
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleScroll);
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

})();
