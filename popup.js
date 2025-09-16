// Popup script for Auto Russian-English Translator
document.addEventListener('DOMContentLoaded', function() {
    const translationToggle = document.getElementById('translationToggle');
    const statusDisplay = document.getElementById('statusDisplay');
    const retranslateBtn = document.getElementById('retranslateBtn');
    const refreshBtn = document.getElementById('refreshBtn');

    // Load current settings
    loadSettings();

    // Toggle translation on/off
    translationToggle.addEventListener('click', function() {
        const isEnabled = !translationToggle.classList.contains('active');
        toggleTranslation(isEnabled);
    });

    // Retranslate current page
    retranslateBtn.addEventListener('click', function() {
        retranslateBtn.textContent = '🔄 Retranslating...';
        retranslateBtn.disabled = true;
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'retranslate'}, function(response) {
                setTimeout(() => {
                    retranslateBtn.textContent = '🔄 Retranslate Current Page';
                    retranslateBtn.disabled = false;
                }, 1000);
            });
        });
    });

    // Refresh current page
    refreshBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.reload(tabs[0].id);
            window.close();
        });
    });

    function loadSettings() {
        chrome.storage.sync.get(['translationEnabled'], function(result) {
            const isEnabled = result.translationEnabled !== false; // Default to true
            updateToggleUI(isEnabled);
            updateStatus(isEnabled);
        });
    }

    function toggleTranslation(enabled) {
        // Save setting
        chrome.storage.sync.set({translationEnabled: enabled}, function() {
            updateToggleUI(enabled);
            updateStatus(enabled);
            
            // Notify content script
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleTranslation',
                    enabled: enabled
                }, function(response) {
                    // Handle response if needed
                });
            });
        });
    }

    function updateToggleUI(enabled) {
        if (enabled) {
            translationToggle.classList.add('active');
        } else {
            translationToggle.classList.remove('active');
        }
    }

    function updateStatus(enabled) {
        if (enabled) {
            statusDisplay.textContent = '✅ Translation is ON';
            statusDisplay.className = 'status enabled';
            retranslateBtn.disabled = false;
        } else {
            statusDisplay.textContent = '❌ Translation is OFF';
            statusDisplay.className = 'status disabled';
            retranslateBtn.disabled = true;
        }
    }

    // Check if current tab has Russian content
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url && (tabs[0].url.startsWith('http://') || tabs[0].url.startsWith('https://'))) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    const textContent = document.body.textContent || document.body.innerText || '';
                    // Enhanced pattern for Cyrillic detection including extended characters
                    const russianPattern = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    return russianPattern.test(textContent);
                }
            }, function(result) {
                if (result && result[0] && result[0].result) {
                    // Page contains Russian text
                    const indicator = document.createElement('div');
                    indicator.style.cssText = `
                        background: #e8f5e8;
                        color: #2e7d32;
                        padding: 8px;
                        border-radius: 6px;
                        font-size: 12px;
                        text-align: center;
                        margin-bottom: 10px;
                    `;
                    indicator.textContent = '🇷🇺 Russian text detected on this page';
                    document.querySelector('.control-section').insertBefore(indicator, document.querySelector('.toggle-container'));
                }
            });
        }
    });
});
