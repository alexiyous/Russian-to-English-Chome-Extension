// Background script for Auto Russian-English Translator
chrome.runtime.onInstalled.addListener(function(details) {
    // Set default settings on first install
    chrome.storage.sync.set({
        translationEnabled: true
    });
    
    // Create context menu
    chrome.contextMenus.create({
        id: 'translatePage',
        title: 'Translate this page (Russian → English)',
        contexts: ['page']
    });
    
    console.log('Auto Translator: Extension installed/updated');
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'getSettings') {
        chrome.storage.sync.get(['translationEnabled'], function(result) {
            sendResponse({
                translationEnabled: result.translationEnabled !== false
            });
        });
        return true; // Indicates we will send a response asynchronously
    }
    
    if (request.action === 'updateSettings') {
        chrome.storage.sync.set(request.settings, function() {
            sendResponse({success: true});
        });
        return true;
    }
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === 'translatePage') {
        chrome.tabs.sendMessage(tab.id, {action: 'retranslate'});
    }
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
    console.log('Auto Translator: Service worker started');
});

// Clean up on suspend
chrome.runtime.onSuspend.addListener(() => {
    console.log('Auto Translator: Service worker suspending');
});
