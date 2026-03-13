# Changelog

All notable changes to the **Markdown Documentation Explorer** extension will be documented in this file.

## [1.1.0] - 2026-03-17

### Added
- **Export to PDF**: Export your markdown files directly to a beautifully formatted PDF document.
  - Generates PDFs with proper styling, pagination, and print margins.
  - Automatically handles resolving local relative image paths.
  - Integrates full Mermaid chart rendering explicitly to ensure charts render before conversion.
  - Automatically expands collapsed `<details>` / `<summary>` sections so all content is correctly evaluated and visible in the exported PDF.
- **Multiple Simultaneous Previews**: You can now open multiple markdown files in individual preview tabs simultaneously. Opening new previews will no longer override the existing active preview tab unless it is for the exact same file.
- **Right-Click Open Preview Menu**: Added an "Open Markdown Preview" option to the standard VS Code Explorer file context right-click menu and editor title context menu for all `.md` files.
- **Edit Markdown Action**: Added a convenient "Edit Markdown" action to the preview tab itself, allowing you to instantly switch back to editing mode beside the current preview.
- **Syntax Highlighting**: Added fully functional syntax highlighting (via `highlight.js`) for code blocks in the markdown preview.

### Fixed
- **Table Rendering Issue**: Fixed an issue where markdown tables in the preview were missing their internal borders and lines.
- **Font Styling Fixes**: Adjusted the markdown preview to use the native VS Code default editor font family, bringing the rendering more in line with standard VS Code aesthetics.
