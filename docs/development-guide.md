# Markdown Explorer Development Guide

## How to Run the Project Locally

1. **Prerequisites**
   Ensure you have [Node.js](https://nodejs.org/) installed along with `npm`.

2. **Install Dependencies**
   Navigate to the project root and install the required dependencies:
   ```bash
   npm install
   ```

3. **Build the Project**
   The project uses `esbuild` for fast bundling. To compile the extension:
   ```bash
   npm run build
   ```
   *To watch for changes during development, you can use `npm run watch`.*

4. **Launch the Extension Development Host**
   Open the project folder in **VSCode**.
   Press `F5` (or navigate to **Run -> Start Debugging**). This will compile the code and launch a new VSCode window labelled **"Extension Development Host"** where the extension is active.

---

## How to Test the Plugin

Once you have the Extension Development Host window open, follow these steps to test the features:

1. **Verify the Sidebar Explorer**:
   - Look for the new "MD" icon in the Activity Bar.
   - Click it to view the **Workspace Explorer**. It will show a tree of all markdown files in the current workspace.
   - If your workspace contains an `mkdocs.yml` file, the **MkDocs Explorer** view will also populate.

2. **Test Markdown Previews**:
   - Click on any `.md` file in the Workspace Explorer.
   - A Webview panel will open rendering the markdown.
   - Test out internal links within the preview; clicking them should open the target markdown file in the preview panel.

3. **Test Global Search**:
   - Open the Command Palette (`Cmd + Shift + P` on Mac or `Ctrl + Shift + P` on Windows/Linux).
   - Type and select: **`Markdown Explorer: Search globally`**.
   - Start typing to search across all your indexed markdown files. It will display matching files and a snippet of the content. Selecting a result will open it in the preview panel.

---

## Building the VSIX Locally

To compile and package the extension into a `.vsix` file for local installation:

```bash
npm run build && npx @vscode/vsce package --no-dependencies
```

This will generate a file like `markdown-explorer-0.0.1.vsix` in the project root.

**To install the VSIX locally in VS Code:**

- **Via Command Palette:** `Cmd + Shift + P` → `Extensions: Install from VSIX...` → select the generated `.vsix` file.
- **Via Terminal:**
  ```bash
  code --install-extension markdown-explorer-0.0.1.vsix
  ```

---

## How to Publish the Plugin

To publish the extension to the Visual Studio Code Marketplace, you will use the `vsce` (Visual Studio Code Extension) command-line tool.

1. **Install `vsce`**
   Install the tool globally via npm:
   ```bash
   npm install -g @vscode/vsce
   ```

2. **Create a Publisher**
   If you don't have one, create a publisher on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage).

3. **Update `package.json`**
   Ensure your `package.json` has the correct `publisher` field:
   ```json
   "publisher": "your-publisher-name"
   ```

4. **Login via `vsce`**
   Login using your Personal Access Token (PAT) from Azure DevOps:
   ```bash
   vsce login your-publisher-name
   ```

5. **Package the Extension**
   To generate a `.vsix` package for local installation or manual distribution:
   ```bash
   vsce package --no-dependencies
   ```

6. **Publish to the Marketplace**
   To publish the extension directly to the marketplace:
   ```bash
   vsce publish
   ```
