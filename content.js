// Auto Russian-English Translator Content Script
(function() {
    'use strict';

    let isTranslationActive = false;
    let translationEnabled = true;
    
    // Cache for storing translations to avoid re-translating same text
    const translationCache = new Map();
    
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
            const russianPattern = /[\u0400-\u04FF]/;
            return russianPattern.test(textContent);
        } catch (error) {
            console.log('Auto Translator: Error checking translation settings:', error);
            return true; // Default to translating if we can't access storage
        }
    }

    // Direct text translation using Google Translate API with caching
    async function translateText(text, sourceLang = 'ru', targetLang = 'en') {
        const cleanText = text.trim();
        
        // Check cache first
        if (translationCache.has(cleanText)) {
            return translationCache.get(cleanText);
        }
        
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                const translation = result[0][0][0];
                // Cache the translation
                translationCache.set(cleanText, translation);
                return translation;
            }
            return cleanText; // Return original if translation fails
        } catch (error) {
            console.log('Translation error:', error);
            return cleanText;
        }
    }

    // Translate all text nodes on the page
    async function translatePageContent() {
        if (isTranslationActive) {
            return;
        }
        
        isTranslationActive = true;
        
        // Show translation indicator
        showTranslationIndicator();
        
        // Set up content observer for dynamic content
        setupContentObserver();
        
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
                    if (parent.hasAttribute('data-translated')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Only translate nodes with meaningful Russian text
                    const text = node.textContent.trim();
                    if (text.length < 3) return NodeFilter.FILTER_REJECT;
                    
                    const russianPattern = /[\u0400-\u04FF]/;
                    return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );
        
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        console.log(`Found ${textNodes.length} text nodes to translate`);
        
        // Translate nodes in batches to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < textNodes.length; i += batchSize) {
            const batch = textNodes.slice(i, i + batchSize);
            const translations = await Promise.all(
                batch.map(node => translateText(node.textContent.trim()))
            );
            
            batch.forEach((node, index) => {
                const originalText = node.textContent.trim();
                const translatedText = translations[index];
                if (translatedText && translatedText !== originalText) {
                    // Store original text before translating
                    node.parentElement.setAttribute('data-original-text', originalText);
                    node.parentElement.setAttribute('data-translated', 'true');
                    node.parentElement.setAttribute('data-translation', translatedText);
                    node.textContent = translatedText;
                }
            });
            
            // Small delay between batches to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        updateTranslationIndicator(`Translated ${textNodes.length} text elements`);
        
        // Hide indicator after 3 seconds
        setTimeout(() => {
            hideTranslationIndicator();
        }, 3000);
    }

    // Show translation progress indicator
    function showTranslationIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'translation-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1a73e8;
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 999999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
        `;
        indicator.innerHTML = '🔄 Translating page...';
        document.body.appendChild(indicator);
    }

    // Update translation indicator
    function updateTranslationIndicator(message) {
        const indicator = document.getElementById('translation-indicator');
        if (indicator) {
            indicator.innerHTML = `✅ ${message}`;
            indicator.style.background = '#4caf50';
        }
    }

    // Hide translation indicator
    function hideTranslationIndicator() {
        const indicator = document.getElementById('translation-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Function to translate a single text node
    async function translateSingleNode(node) {
        const parent = node.parentElement;
        if (!parent) return false;
        
        // Skip if already translated
        if (parent.hasAttribute('data-translated')) {
            return false;
        }
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'meta', 'head'].includes(tagName)) {
            return false;
        }
        
        const text = node.textContent.trim();
        if (text.length < 3) return false;
        
        const russianPattern = /[\u0400-\u04FF]/;
        if (!russianPattern.test(text)) return false;
        
        try {
            const translatedText = await translateText(text);
            if (translatedText && translatedText !== text) {
                parent.setAttribute('data-original-text', text);
                parent.setAttribute('data-translated', 'true');
                parent.setAttribute('data-translation', translatedText);
                node.textContent = translatedText;
                return true;
            }
        } catch (error) {
            console.log('Error translating single node:', error);
        }
        
        return false;
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
                            // Find all text nodes in the added element
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
                                        
                                        if (parent.hasAttribute('data-translated')) {
                                            return NodeFilter.FILTER_REJECT;
                                        }
                                        
                                        const text = textNode.textContent.trim();
                                        if (text.length < 3) return NodeFilter.FILTER_REJECT;
                                        
                                        const russianPattern = /[\u0400-\u04FF]/;
                                        return russianPattern.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                                    }
                                }
                            );
                            
                            let textNode;
                            while (textNode = walker.nextNode()) {
                                nodesToTranslate.push(textNode);
                            }
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    // Handle text content changes
                    const parent = mutation.target.parentElement;
                    if (parent && parent.hasAttribute('data-translated')) {
                        // Check if the text was reverted to original
                        const originalText = parent.getAttribute('data-original-text');
                        const currentText = mutation.target.textContent.trim();
                        if (currentText === originalText) {
                            // Restore translation
                            const savedTranslation = parent.getAttribute('data-translation');
                            if (savedTranslation) {
                                mutation.target.textContent = savedTranslation;
                            }
                        }
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

    // Translate newly discovered nodes
    async function translateNewNodes(nodes) {
        const batchSize = 5;
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);
            await Promise.all(batch.map(node => translateSingleNode(node)));
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    // Function to check and restore translations in viewport
    function checkViewportTranslations() {
        const allElements = document.querySelectorAll('[data-translated="true"]');
        
        allElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            
            if (isInViewport) {
                const textNode = element.firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    const currentText = textNode.textContent.trim();
                    const originalText = element.getAttribute('data-original-text');
                    const savedTranslation = element.getAttribute('data-translation');
                    
                    // If text reverted to original, restore translation
                    if (currentText === originalText && savedTranslation) {
                        textNode.textContent = savedTranslation;
                    }
                }
            }
        });
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
            
            // Clear translation cache
            translationCache.clear();
            
            // Remove translation markers and restore original text
            const translatedElements = document.querySelectorAll('[data-translated]');
            translatedElements.forEach(element => {
                const originalText = element.getAttribute('data-original-text');
                const textNode = element.firstChild;
                if (originalText && textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = originalText;
                }
                element.removeAttribute('data-translated');
                element.removeAttribute('data-original-text');
                element.removeAttribute('data-translation');
            });
            
            // Disconnect observer
            if (contentObserver) {
                contentObserver.disconnect();
                contentObserver = null;
            }
            
            // Hide any existing indicator
            hideTranslationIndicator();
            
            // Start fresh translation
            setTimeout(() => {
                autoTranslateToEnglish();
            }, 500);
            
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
                checkViewportTranslations();
                // Also check for any new untranslated Russian text in viewport
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
                    if (parent.hasAttribute('data-translated')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    
                    // Check if element is in viewport
                    const rect = parent.getBoundingClientRect();
                    const isInViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100; // 100px buffer
                    
                    if (!isInViewport) return NodeFilter.FILTER_REJECT;
                    
                    const text = node.textContent.trim();
                    if (text.length < 3) return NodeFilter.FILTER_REJECT;
                    
                    const russianPattern = /[\u0400-\u04FF]/;
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
