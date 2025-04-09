# Vision Analyzer for Mobile MCP

The Vision Analyzer is a new tool added to Mobile MCP that leverages OpenAI's Vision API to detect UI elements in mobile app screenshots. This provides an alternative approach to locating elements when accessibility information is incomplete or unavailable.

## Features

- Detects UI elements (buttons, text fields, toggles, etc.) in a screenshot using AI vision capabilities
- Returns precise coordinates and element types for interaction
- Works with any mobile app without requiring accessibility support
- Provides confidence scores for detected elements
- Optimizes images to reduce token usage and API costs
- Can save optimized images to disk for inspection and comparison

## Prerequisites

- An OpenAI API key with access to the GPT-4 Vision API
- A connected mobile device (Android or iOS)
- Mobile MCP installed and configured

## Usage

### Via MCP Tool

The Vision Analyzer is exposed as an MCP tool called `mobile_vision_analyze`. Here's how to use it:

1. Make sure you've selected a device using `mobile_use_device`
2. Call the vision analysis tool with your OpenAI API key and optional optimization parameters:

```json
{
  "name": "mobile_vision_analyze",
  "parameters": {
    "apiKey": "your-openai-api-key-here",
    "maxWidth": 800,
    "maxHeight": 800,
    "quality": 85,
    "format": "jpeg",
    "saveOptimizedImage": true,
    "outputPath": "./"
  }
}
```

### Optimization Parameters

To reduce token usage and improve performance, you can customize the image processing:

| Parameter | Description | Default | Recommended for 1080p Screens |
|-----------|-------------|---------|-------------------------------|
| maxWidth  | Maximum width in pixels | 800 | 800-1000 |
| maxHeight | Maximum height in pixels | 800 | 800-1000 |
| quality   | JPEG compression (1-100) | 85 | 75-85 |
| format    | Image format ("jpeg" or "png") | "jpeg" | "jpeg" |
| saveOptimizedImage | Whether to save the optimized image | false | true (for debugging) |
| outputPath | Directory to save optimized images | "./" | Any valid directory path |

For a typical 1920x1080 resolution screen, using maxWidth=800 and maxHeight=800 with a JPEG quality of 80 can reduce token usage by 70-90% compared to the original screenshot while maintaining enough detail for accurate element detection.

### Saving Optimized Images

Setting `saveOptimizedImage: true` will save the optimized image that is actually sent to the Vision API. This is useful for:

1. Confirming the image quality is sufficient for element detection
2. Debugging cases where the Vision API returns unexpected results
3. Finding the optimal balance between quality and token consumption

The saved image will include a timestamp in the filename (e.g., `optimized-screenshot-2023-05-15T12-45-30-123Z.jpeg`).

The tool will:
1. Take a screenshot of the current screen
2. Resize and optimize it according to your parameters
3. Optionally save the optimized image to disk
4. Send it to OpenAI's Vision API for analysis
5. Return a structured JSON response with detected UI elements and their coordinates

### Example Response

```json
[
  {
    "name": "Back Button",
    "x": 0.05,
    "y": 0.08,
    "confidence": 0.95,
    "type": "button"
  },
  {
    "name": "Profile Icon",
    "x": 0.92,
    "y": 0.08,
    "confidence": 0.9,
    "type": "icon"
  },
  {
    "name": "Search Bar",
    "x": 0.5,
    "y": 0.15,
    "confidence": 0.85,
    "type": "text_field"
  }
]
```

### Coordinates

The coordinates are normalized between 0 and 1, where:
- `x: 0, y: 0` is the top-left corner of the screen
- `x: 1, y: 1` is the bottom-right corner of the screen

This means you can use these coordinates with the `mobile_click_on_screen_at_coordinates` tool directly.

## Token Usage Optimization

The Vision API prices are based on the number of tokens processed, which is heavily influenced by image size and complexity. Here's how to optimize:

1. **Resolution**: Resize large screenshots to a reasonable size (800x800px is usually sufficient)
2. **Compression**: Use JPEG format with a quality setting of 70-85%
3. **Balance**: Find the right balance between image quality and token usage
4. **Validation**: Save the optimized images and verify they retain sufficient detail

### Recommended Settings by Screen Resolution

| Screen Resolution | Recommended Settings | Expected Savings |
|-------------------|----------------------|------------------|
| 720p (1280x720)   | maxWidth: 640, quality: 80 | ~70% |
| 1080p (1920x1080) | maxWidth: 800, quality: 80 | ~80% |
| 1440p (2560x1440) | maxWidth: 900, quality: 75 | ~90% |
| 4K (3840x2160)    | maxWidth: 1000, quality: 70 | ~95% |

## Standalone Usage

You can also use the Vision Analyzer programmatically or with the included test script:

1. Set your OpenAI API key as an environment variable:
   ```
   export OPENAI_API_KEY=your-api-key-here
   ```

2. Run the test script:
   ```
   npx ts-node test/vision-analyzer-test.ts
   ```

This will:
- Take a screenshot of your connected device
- Save it as `device-screenshot-original.png`
- Process it with different optimization settings
- Save both the optimized images and analysis results to the `output` directory
- Allow you to compare the different quality settings and their effect on element detection

## Use Cases

- Automating apps with poor accessibility support
- Locating visually distinct elements that lack proper identifiers
- Providing a fallback when standard automation approaches fail
- Analyzing complex UIs where structure is difficult to determine programmatically

## Troubleshooting

- **Vision API errors**: Check that your API key is valid and has access to GPT-4 Vision
- **No elements detected**: Ensure the screenshot is clear and the UI has visible elements
- **Incorrect coordinates**: Try adjusting your device orientation or resolution
- **Token usage too high**: Lower the image quality and resolution parameters
- **Poor detection quality**: Increase the image quality or try PNG format instead of JPEG
- **Missing elements**: Check the saved optimized image to see if important UI details were preserved

## Security Considerations

- Your API key is sent to OpenAI along with screenshots of your device
- Be cautious about analyzing screens with sensitive information
- Consider using a dedicated API key with usage limits for this feature 