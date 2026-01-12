# D2 in Markdown

Render D2 diagrams directly within VS Code Markdown preview. This extension supports both inline code blocks and file imports, offering a lightweight and robust integration with the D2 CLI.

## Prerequisites

The D2 CLI must be installed on your system and available in your PATH.

1. **Install D2**: Follow the instructions at [d2lang.com/tour/install](https://d2lang.com/tour/install).
2. **Verify**: Ensure `d2 --version` returns a version number in your terminal.

## Features

- **Inline Rendering**: Renders `d2` fenced code blocks as SVGs directly in the preview.
- **File Imports**: Supports `@import` syntax to render external `.d2` files without cluttering your Markdown.
- **Smart Path Resolution**: Resolves import paths relative to the current file or workspace root.
- **Robust Rendering**: Uses a core-rule interception strategy to prevent conflicts with other D2 extensions.
- **Configuration**: comprehensive control over themes, layout engines, and visual styles.

## Usage

### Inline Diagrams

Create a code block using the `d2` language identifier:

```d2
direction: right
x -> y: Hello D2
y -> z: Connects to Z
```

### Importing Files

Use the `@import` syntax to reference external files.

```d2
@import "./diagrams/architecture.d2"
```

## Configuration

You can configure the renderer using the Command Palette or VS Code Settings.

### Quick Configuration
1. Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2. Run **D2: Configure Renderer**.
3. Select an option to change the Theme, Layout Engine, or toggle Sketch Mode. The preview will update immediately.

### Settings
You can also configure these in your `settings.json`:

- `d2InMarkdown.theme`: The ID of the theme to use (e.g., 0 for Neutral, 6 for Grape Soda, 300 for Terminal).
- `d2InMarkdown.darkTheme`: Theme to use when VS Code is in dark mode.
- `d2InMarkdown.layout`: Layout engine (`dagre` or `elk`).
- `d2InMarkdown.sketch`: Boolean to enable hand-drawn sketch style.
- `d2InMarkdown.pad`: Padding in pixels around the diagram.
- `d2InMarkdown.scale`: Scale factor (default -1 fits to screen).