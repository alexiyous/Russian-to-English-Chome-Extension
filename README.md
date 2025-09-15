# Auto Russian-English Translator Chrome Extension

A Chrome extension that automatically translates webpages from Russian to English using Google Translate. The translation persists even when pages are refreshed or navigated.

## Features

- ✅ **Automatic Detection**: Automatically detects Russian text on webpages
- ✅ **Instant Translation**: Translates entire pages from Russian to English
- ✅ **Persistent Translation**: Works even after page refresh or navigation
- ✅ **Toggle Control**: Easy on/off toggle via popup interface
- ✅ **Manual Retranslate**: Option to manually retranslate current page
- ✅ **Clean Interface**: Minimal, user-friendly popup design
- ✅ **Google Translate Powered**: Uses reliable Google Translate service

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

1. **Content Script Injection**: The extension injects a content script into all webpages
2. **Russian Text Detection**: Uses Unicode range detection to identify Cyrillic/Russian text
3. **Google Translate Integration**: Loads Google Translate widget invisibly
4. **Automatic Translation**: Sets language to English and triggers translation
5. **UI Cleanup**: Hides Google Translate's default interface elements
6. **Persistence**: Maintains translation state across page refreshes and navigation

## Permissions Explained

The extension requires these permissions:

- **`storage`**: Save user preferences (enable/disable translation)
- **`activeTab`**: Access the currently active tab for translation
- **`scripting`**: Inject translation scripts into webpages
- **`host_permissions`**: Access to all websites for translation
- **`translate.googleapis.com`**: Access to Google Translate service

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
- **Translation Service**: Google Translate Web Widget
- **Detection Method**: Unicode range pattern matching
- **Persistence**: Chrome storage API for settings
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
