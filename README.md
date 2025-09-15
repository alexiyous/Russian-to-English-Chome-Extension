# Auto Russian-English Translator Chrome Extension

A Chrome extension that automatically translates webpages from Russian to English using Google Translate. The extension remembers your on/off preference across browser sessions.

## Features

- ✅ **Smart Russian Detection**: Uses Unicode pattern matching to detect Cyrillic text
- ✅ **Direct API Translation**: Uses Google Translate API for fast, accurate translations
- ✅ **Translation Caching**: Avoids re-translating identical text for better performance
- ✅ **Dynamic Content Support**: Automatically translates new content loaded via JavaScript
- ✅ **Viewport-Based Processing**: Smart batching and viewport-aware translation
- ✅ **Persistent Settings**: Extension on/off state persists across browser sessions
- ✅ **Visual Indicators**: Shows translation progress and Russian text detection
- ✅ **Context Menu Integration**: Right-click option to translate pages
- ✅ **Background Processing**: Service worker handles settings and context menus

## Installation

### Option 1: Load as Unpacked Extension (Development)

1. **Download/Clone** this repository to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer mode** by toggling the switch in the top-right corner
4. **Click "Load unpacked"** button
5. **Select the folder** containing this extension (the folder with `manifest.json`)

## Usage

### Automatic Translation
- **Visit any webpage** with Russian text
- **The extension automatically detects** Russian content
- **Translation begins automatically** within a few seconds
- **Page translates to English** using Google Translate

### Manual Controls
1. **Click the extension icon** in the Chrome toolbar
2. **Use the toggle switch** to enable/disable auto-translation
3. **Click "Retranslate Current Page"** to manually trigger translation
4. **Click "Refresh Page"** to reload the current page

### Status Indicators
- **Green status**: Translation is enabled and active
- **Red status**: Translation is disabled
- **Russian flag indicator**: Shows when Russian text is detected on current page

## How It Works

1. **Content Script Injection**: Runs on all webpages via content script
2. **Text Node Analysis**: Scans DOM text nodes using TreeWalker API
3. **Russian Pattern Matching**: Uses Unicode range [\u0400-\u04FF] to detect Cyrillic text
4. **Direct API Calls**: Makes requests to Google Translate API (translate.googleapis.com)
5. **Batch Processing**: Translates text in batches of 10 nodes with delays to respect API limits
6. **DOM Manipulation**: Replaces original text while preserving original in data attributes
7. **Mutation Observer**: Monitors page changes to translate dynamically loaded content
8. **Viewport Optimization**: Prioritizes translation of visible content with scroll-based checking
9. **Translation Cache**: Stores translations in memory to avoid duplicate API calls
10. **State Persistence**: Uses Chrome storage API to remember on/off preference across sessions

## Permissions Explained

The extension requires these permissions:

- **`storage`**: Save translation on/off preference across browser sessions
- **`activeTab`**: Access current tab for translation and Russian text detection
- **`scripting`**: Inject content scripts and execute translation functions
- **`notifications`**: Show translation status notifications (if needed)
- **`contextMenus`**: Add right-click "Translate page" option
- **`host_permissions`**: Access all HTTP/HTTPS sites for translation
- **`translate.googleapis.com`**: Direct API access to Google Translate service

## Troubleshooting

### Translation Not Working
1. **Check if translation is enabled** in the popup
2. **Verify the page contains Russian text** (look for the Russian flag indicator)
3. **Try manually retranslating** using the popup button
4. **Refresh the page** if translation seems stuck

### Google Translate Issues
1. **Check internet connection** (Google Translate requires internet)
2. **Verify Google Translate is accessible** in your region
3. **Try disabling other translation extensions** that might conflict

## Customization

### Change Target Language
To translate to a different language, edit `content.js`:
```javascript
// Change 'en' to your desired language code
includedLanguages: 'en,ru',  // Change 'en' to 'es', 'fr', 'de', etc.

// And change the auto-selection
selectElement.value = 'en';  // Change to your target language code
```

### Modify Source Language
To translate from a different source language, edit `content.js`:
```javascript
// Change the detection pattern
const russianPattern = /[\u0400-\u04FF]/;  // This is for Cyrillic/Russian

// Change page language setting
pageLanguage: 'ru',  // Change to your source language code
```

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension standard)
- **Translation Service**: Google Translate REST API (translate.googleapis.com)
- **Detection Method**: Unicode range [\u0400-\u04FF] for Cyrillic script
- **DOM Processing**: TreeWalker API for efficient text node traversal
- **Dynamic Content**: MutationObserver for real-time content monitoring
- **Performance**: Translation caching, batched API calls, viewport prioritization
- **Data Persistence**: Chrome storage.sync API for cross-device settings
- **Service Worker**: Background script for context menus and message handling
- **Compatibility**: Chrome 88+ (Manifest V3 requirement)

## Privacy

- **No data collection**: Extension doesn't collect or store personal data
- **Local processing**: Text detection happens locally in browser
- **Google Translate**: Translation is processed by Google's servers (subject to Google's privacy policy)
- **Settings only**: Only stores user's enable/disable preference locally

## Version History

- **v1.0**: Initial release with automatic Russian-to-English translation

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all files are present and icons are created
3. Check Chrome's extension console for errors
4. Ensure you have a stable internet connection

## License

This extension is provided as-is for educational and personal use. Google Translate integration is subject to Google's terms of service.
