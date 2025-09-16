// Auto Russian-English Translator Content Script
(function() {
    'use strict';

    let isTranslationActive = false;
    let translationEnabled = true;
    
    // Simple set to track which elements have been translated
    // We just need this to avoid re-translating the same elements
    const translatedElements = new WeakSet();
    
    // Observer for detecting new content
    let contentObserver = null;

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

    // Direct text translation using Google Translate API with fallback mechanisms
    async function translateText(text, sourceLang = 'ru', targetLang = 'en') {
        const cleanText = text.trim();
        if (!cleanText) return '';
        
        try {
            // Single API call for better performance - no fallback for short text
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                return result[0][0][0];
            }
            
            return cleanText; // Return original if translation fails
        } catch (error) {
            console.log('Translation error:', error);
            return cleanText;
        }
    }

    // Helper function to identify if an element is a paragraph or block element
    function isBlockElement(element) {
        if (!element) return false;
        
        // Common block elements that might contain full paragraphs
        const blockTags = ['p', 'div', 'article', 'section', 'main', 'blockquote', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        
        return blockTags.includes(element.tagName.toLowerCase());
    }
    
    // Helper to get all text from an element (not just immediate text nodes)
    function getAllTextContent(element) {
        // Skip already translated elements
        if (translatedElements.has(element)) return '';
        
        // Get all text nodes within this element
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
        
        // Set up content observer for dynamic content
        setupContentObserver();
        
        // First, find block elements with Russian text to translate as complete units
        const paragraphElements = [];
        const blockWalker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function(element) {
                    // Skip script, style, and already translated elements
                    const tagName = element.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if already translated
                    if (translatedElements.has(element)) {
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
        
        console.log(`Found ${paragraphElements.length} paragraph/block elements to translate`);
        
        // Now find individual text nodes that aren't part of the selected paragraphs
        const textNodes = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip script, style, and already translated elements
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    
                    const tagName = parent.tagName.toLowerCase();
                    if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Skip if already translated
                    if (translatedElements.has(parent)) {
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
                    
                    // Only translate nodes with meaningful Russian text
                    const text = node.textContent.trim();
                    if (text.length < 2) return NodeFilter.FILTER_REJECT; // Reduced threshold to catch shorter text
                    
                    // Enhanced pattern for Cyrillic detection including extended characters
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        console.log(`Found ${paragraphElements.length} paragraph elements and ${textNodes.length} individual text nodes to translate`);
        
        // Process paragraph elements in parallel batches for better performance
        console.log(`Translating paragraph elements...`);
        const paragraphBatchSize = 5; // Process 5 paragraphs at once
        
        for (let i = 0; i < paragraphElements.length; i += paragraphBatchSize) {
            const batch = paragraphElements.slice(i, i + paragraphBatchSize);
            
            // Process batch in parallel
            await Promise.all(batch.map(element => translateElementContent(element)));
            
            // Update progress
            updateTranslationIndicator(`Translating... (${Math.min(i + paragraphBatchSize, paragraphElements.length)}/${paragraphElements.length} paragraphs)`);
            
            // Short delay only between batches, not individual paragraphs
            if (i + paragraphBatchSize < paragraphElements.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Now handle remaining text nodes
        console.log(`Translating individual text nodes...`);
        
        // Organize nodes by size for more efficient processing
        const smallNodes = [];
        const regularNodes = [];
        
        // Group nodes by size for optimized batching
        textNodes.forEach(node => {
            const text = node.textContent.trim();
            if (text.length <= 5) {
                smallNodes.push(node);
            } else {
                regularNodes.push(node);
            }
        });
        
        // Process all nodes together with larger batches for better performance
        const allNodes = [...regularNodes, ...smallNodes];
        const batchSize = 25; // Increased batch size
        
        for (let i = 0; i < allNodes.length; i += batchSize) {
            const batch = allNodes.slice(i, i + batchSize);
            const translations = await Promise.all(
                batch.map(node => translateText(node.textContent.trim()))
            );
            
            batch.forEach((node, index) => {
                const originalText = node.textContent.trim();
                const translatedText = translations[index];
                if (translatedText && translatedText !== originalText) {
                    // Mark the element as translated and update text directly
                    translatedElements.add(node.parentElement);
                    node.textContent = translatedText;
                }
            });
            
            // Reduced delay for better performance
            if (i + batchSize < allNodes.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // Verify and fix any partial translations
        await verifyTranslations();
        
        // Update progress
        updateTranslationIndicator(`Translated ${paragraphElements.length} paragraphs and ${textNodes.length} text elements`);
        
        isTranslationActive = false;
        setTimeout(() => {
            hideTranslationIndicator();
        }, 3000);
        console.log('Translation complete');
    }

    // Translation indicator functions are defined later in the code

    // Function to translate an entire element's content
    async function translateElementContent(element) {
        // Get all direct text nodes that need translation
        const directTextNodes = [];
        for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i];
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text.length > 0) {
                    // Check for Russian text
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    if (russianPattern.test(text)) {
                        directTextNodes.push(child);
                    }
                }
            }
        }
        
        // If there are direct text nodes, translate them first
        if (directTextNodes.length > 0) {
            const translations = await Promise.all(
                directTextNodes.map(node => translateText(node.textContent.trim()))
            );
            
            directTextNodes.forEach((node, index) => {
                const originalText = node.textContent.trim();
                const translatedText = translations[index];
                if (translatedText && translatedText !== originalText) {
                    // Update the text
                    node.textContent = node.textContent.replace(originalText, translatedText);
                }
            });
        }
        
        // Now find and translate non-block child elements
        const childElements = Array.from(element.children).filter(child => 
            !isBlockElement(child) && !translatedElements.has(child)
        );
        
        for (const childElement of childElements) {
            await translateElementContent(childElement);
        }
        
        // Mark as translated
        translatedElements.add(element);
        return true;
    }

    // Setup MutationObserver to handle dynamic content
    function setupContentObserver() {
        if (contentObserver) {
            contentObserver.disconnect();
        }
        
        contentObserver = new MutationObserver((mutations) => {
            const nodesToTranslate = [];
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            nodesToTranslate.push(node);
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            // First check if this is a paragraph/block element with Russian text
                            if (isBlockElement(node) && containsRussianText(node)) {
                                // Process entire paragraph at once
                                translateElementContent(node).then(() => {
                                    console.log("Translated dynamically added paragraph");
                                });
                            } else {
                                // Find all text nodes in the added element that aren't in paragraphs we're already handling
                                const walker = document.createTreeWalker(
                                    node,
                                    NodeFilter.SHOW_TEXT,
                                    {
                                        acceptNode: function(textNode) {
                                            const parent = textNode.parentElement;
                                            if (!parent) return NodeFilter.FILTER_REJECT;
                                            
                                            const tagName = parent.tagName.toLowerCase();
                                            if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
                                                return NodeFilter.FILTER_REJECT;
                                            }
                                            
                                            if (translatedElements.has(parent)) {
                                                return NodeFilter.FILTER_REJECT;
                                            }
                                            
                                            // Skip if inside a block element we're already handling
                                            let currentParent = parent;
                                            while (currentParent && currentParent !== node) {
                                                if (isBlockElement(currentParent) && containsRussianText(currentParent)) {
                                                    return NodeFilter.FILTER_REJECT;
                                                }
                                                currentParent = currentParent.parentElement;
                                            }
                                            
                                            const text = textNode.textContent.trim();
                                            if (text.length < 2) return NodeFilter.FILTER_REJECT;
                                            
                                            // Enhanced pattern for Cyrillic detection
                                            const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                                            return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                                        }
                                    }
                                );
                                
                                let textNode;
                                while (textNode = walker.nextNode()) {
                                    nodesToTranslate.push(textNode);
                                }
                            }
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    // For any text content changes, check if we need to translate
                    const parent = mutation.target.parentElement;
                    if (!parent || translatedElements.has(parent)) {
                        // If already marked as translated, skip it
                        // We don't restore translations since we're not storing them
                        return;
                    } else {
                        // New text content, check if it needs translation
                        nodesToTranslate.push(mutation.target);
                    }
                }
            });
            
            // Translate new nodes
            if (nodesToTranslate.length > 0) {
                translateNewNodes(nodesToTranslate);
            }
        });
        
        contentObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }


    
    // Function to translate a single text node
    async function translateSingleNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return false;
        
        const parent = node.parentElement;
        if (!parent) return false;
        
        // Skip if already translated
        if (translatedElements.has(parent)) return false;
        
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
                    translatedElements.add(parent);
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

    // Function to check for untranslated Russian text in viewport
    // We only need this one function since we no longer restore translations
    function checkViewportForNewText() {
        checkForUntranslatedText();
    }
    
    // Verification function to check for untranslated Russian text
    async function verifyTranslations() {
        console.log("Verifying translations for completeness...");
        updateTranslationIndicator("Verifying translations...");
        
        // Check all elements that we've marked as translated
        const elementsToCheck = [];
        document.querySelectorAll('*').forEach(element => {
            if (translatedElements.has(element)) {
                elementsToCheck.push(element);
            }
        });
        
        // Look for elements that still contain Russian text
        const incompleteElements = elementsToCheck.filter(element => {
            // Get all text content
            const text = element.textContent || '';
            // Check if it still contains any Russian text
            const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
            return russianPattern.test(text);
        });
        
        if (incompleteElements.length > 0) {
            console.log(`Found ${incompleteElements.length} elements with incomplete translations. Attempting fix...`);
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
            
            console.log("Incomplete translations fix attempt completed");
        } else {
            console.log("All translations are complete");
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

        console.log('Auto Translator: Starting direct translation...');
        await translatePageContent();
    }



    // Initialize translation
    async function initializeTranslation() {
        try {
            const shouldTranslate = await shouldTranslatePage();
            if (!shouldTranslate) {
                return;
            }

            console.log('Auto Translator: Russian text detected, starting direct translation...');
            
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
                    
                    // Skip if already translated
                    if (translatedElements.has(parent)) {
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
            console.log(`Found ${nodesToTranslate.length} untranslated nodes in viewport`);
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
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleScroll);
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

})();
