# D2 in Markdown for VS Code

This extension allows you to render [D2](https://d2lang.com/) diagrams directly within your Markdown files in VS Code.

## Features

- **Inline Rendering**: Write D2 code in a fenced code block, and see the diagram in the preview.
- **Import Support**: Import external D2 files to keep your Markdown clean.

## Prerequisites

You must have the [D2 CLI](https://d2lang.com/tour/install) installed on your system.

```bash
# Check if installed
d2 --version
```

## Usage

### Inline Diagram

Use a code block with the language `d2`:

```d2
x -> y: hello world
```

### Import Diagram

Use the `@import` syntax inside a `d2` block:

```d2
@import "./diagrams/my-diagram.d2"
```

The path is relative to the Markdown file you are editing.
