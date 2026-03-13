import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import MarkdownIt from 'markdown-it';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItAdmonition from 'markdown-it-admonition';
import markdownItFootnote from 'markdown-it-footnote';
import hljs from 'highlight.js';

export class MarkdownPreviewPanel {
    private static _panels: Map<string, MarkdownPreviewPanel> = new Map();
    private static _activePanel: MarkdownPreviewPanel | undefined;

    /** Keep backward-compat: returns the last-focused panel */
    public static get currentPanel(): MarkdownPreviewPanel | undefined {
        return MarkdownPreviewPanel._activePanel;
    }

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentDocumentUri: vscode.Uri;
    private _mdRenderer: MarkdownIt;

    public get documentUri(): vscode.Uri {
        return this._currentDocumentUri;
    }

    public static createOrShow(extensionUri: vscode.Uri, documentUri: vscode.Uri, query?: string) {
        const key = documentUri.fsPath;
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If a panel already exists for this file, reveal it
        const existing = MarkdownPreviewPanel._panels.get(key);
        if (existing) {
            existing._panel.reveal(column);
            existing.update(documentUri, query);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'markdownExplorerPreview',
            path.basename(documentUri.fsPath),
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.dirname(documentUri.fsPath)),
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        const instance = new MarkdownPreviewPanel(panel, extensionUri, documentUri, query);
        MarkdownPreviewPanel._panels.set(key, instance);
        MarkdownPreviewPanel._activePanel = instance;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, documentUri: vscode.Uri, query?: string) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._currentDocumentUri = documentUri;

        // Initialize markdown-it with plugins
        let mdOptions: MarkdownIt.Options = {
            html: true,
            linkify: true,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                    } catch (__) { }
                }
                return ''; // use external default escaping
            }
        };

        this._mdRenderer = new MarkdownIt(mdOptions)
            .use(markdownItTaskLists)
            .use(markdownItAdmonition)
            .use(markdownItFootnote);

        // Custom fence rendering for mermaid
        const defaultFenceRender = this._mdRenderer.renderer.rules.fence || function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
        this._mdRenderer.renderer.rules.fence = function (tokens, idx, options, env, self) {
            const token = tokens[idx];
            if (token.info.trim() === 'mermaid') {
                return `<div class="mermaid">\n${token.content}</div>\n`;
            }
            return defaultFenceRender(tokens, idx, options, env, self);
        };

        // Custom image rendering for local URIs
        const defaultImageRender = this._mdRenderer.renderer.rules.image || function (tokens, idx, options, env, self) {
            return self.renderToken(tokens, idx, options);
        };
        const webview = this._panel.webview;
        const currentDocPath = this._currentDocumentUri.fsPath;

        this._mdRenderer.renderer.rules.image = function (tokens, idx, options, env, self) {
            const token = tokens[idx];
            const srcIndex = token.attrIndex('src');
            if (srcIndex >= 0) {
                const src = token.attrs![srcIndex][1];
                if (!src.startsWith('http') && !src.startsWith('data:')) {
                    const localPath = vscode.Uri.file(path.join(path.dirname(currentDocPath), src));
                    token.attrs![srcIndex][1] = webview.asWebviewUri(localPath).toString();
                }
            }
            return defaultImageRender(tokens, idx, options, env, self);
        };

        this.update(documentUri, query);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Track which panel is active
        this._panel.onDidChangeViewState(() => {
            if (this._panel.active) {
                MarkdownPreviewPanel._activePanel = this;
            }
        }, null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'openLink':
                        const targetUri = vscode.Uri.file(path.resolve(path.dirname(this._currentDocumentUri.fsPath), message.href));
                        if (fs.existsSync(targetUri.fsPath)) {
                            MarkdownPreviewPanel.createOrShow(this._extensionUri, targetUri);
                        } else {
                            vscode.window.showErrorMessage(`File not found: ${message.href}`);
                        }
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public update(documentUri: vscode.Uri, query?: string) {
        this._currentDocumentUri = documentUri;
        this._panel.title = path.basename(documentUri.fsPath);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, query);
    }

    private _getHtmlForWebview(webview: vscode.Webview, query?: string) {
        let content = '';
        try {
            content = fs.readFileSync(this._currentDocumentUri.fsPath, 'utf8');
        } catch (e) {
            content = `# Error\nCould not read file: ${this._currentDocumentUri.fsPath}`;
        }

        const htmlContent = this._mdRenderer.render(content);
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'markdown.css'));

        // Load configuration
        const enableMermaid = vscode.workspace.getConfiguration('markdownExplorer').get<boolean>('enableMermaid', true);

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Markdown Preview</title>
                <link id="hljs-style" rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css">
                <link rel="stylesheet" href="${styleUri}">
                <style>
                    body { font-family: var(--vscode-markdown-font-family, -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif); color: var(--vscode-editor-foreground); padding: 20px; }
                    img { max-width: 100%; height: auto; }
                    pre { background-color: var(--vscode-textCodeBlock-background); padding: 10px; overflow-x: auto; }
                    code { font-family: var(--vscode-editor-font-family); }
                    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    mark { background-color: var(--vscode-editor-findMatchHighlightBackground, #ea5c0055); color: inherit; }
                    
                    /* Custom Search Bar */
                    #custom-search-bar {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-editorWidget-border);
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                        border-radius: 4px;
                        display: none;
                        align-items: center;
                        padding: 6px;
                        z-index: 9999;
                        gap: 6px;
                    }
                    #custom-search-bar.visible {
                        display: flex;
                    }
                    #custom-search-bar input {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 4px 8px;
                        border-radius: 2px;
                        outline: none;
                        width: 200px;
                    }
                    #custom-search-bar input:focus {
                        border-color: var(--vscode-focusBorder);
                    }
                    #custom-search-bar button {
                        background: transparent;
                        color: var(--vscode-icon-foreground);
                        border: none;
                        cursor: pointer;
                        padding: 4px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 3px;
                    }
                    #custom-search-bar button:hover {
                        background: var(--vscode-toolbar-hoverBackground);
                    }
                    .search-icon { font-size: 14px; }
                </style>
                ${enableMermaid ? `<script type="module">
                    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
                    mermaid.initialize({ startOnLoad: true, theme: 'dark' });
                </script>` : ''}
            </head>
            <body>
                <div id="custom-search-bar">
                    <input id="search-input" type="text" placeholder="Find in document..." />
                    <button id="search-prev" title="Previous Match"><span class="search-icon">↑</span></button>
                    <button id="search-next" title="Next Match"><span class="search-icon">↓</span></button>
                    <button id="search-close" title="Close"><span class="search-icon">✕</span></button>
                </div>
                <div class="markdown-body">
                    ${htmlContent}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Theme adjustments
                    const isLight = document.body.classList.contains('vscode-light');
                    document.getElementById('hljs-style').href = isLight ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.attributeName === 'class') {
                                const isLight = document.body.classList.contains('vscode-light');
                                document.getElementById('hljs-style').href = isLight ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css';
                            }
                        });
                    });
                    observer.observe(document.body, { attributes: true });

                    const searchBar = document.getElementById('custom-search-bar');
                    const searchInput = document.getElementById('search-input');
                    const searchNext = document.getElementById('search-next');
                    const searchPrev = document.getElementById('search-prev');
                    const searchClose = document.getElementById('search-close');

                    function performSearch(backwards = false) {
                        const val = searchInput.value;
                        if (val) {
                            window.find(val, false, backwards, true, false, false, false);
                        }
                    }

                    searchNext.addEventListener('click', () => performSearch(false));
                    searchPrev.addEventListener('click', () => performSearch(true));
                    
                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            performSearch(e.shiftKey);
                        } else if (e.key === 'Escape') {
                            closeSearch();
                        }
                    });

                    searchClose.addEventListener('click', closeSearch);

                    function closeSearch() {
                        searchBar.classList.remove('visible');
                        window.getSelection().removeAllRanges();
                    }

                    // Listen for Cmd+F / Ctrl+F Native Override
                    document.addEventListener('keydown', (e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                            e.preventDefault();
                            searchBar.classList.add('visible');
                            searchInput.focus();
                            searchInput.select();
                        } else if (e.key === 'Escape' && searchBar.classList.contains('visible')) {
                            closeSearch();
                        }
                    });

                    // Highlight logic from global search link
                    const globalQuery = ${query ? JSON.stringify(query) : 'null'};
                    
                    if (globalQuery) {
                        searchInput.value = globalQuery;
                        setTimeout(() => {
                            performSearch(false);
                        }, 100);
                    }

                    document.addEventListener('click', event => {
                        let node = event && event.target;
                        while (node) {
                            if (node.tagName && node.tagName === 'A' && node.href) {
                                const href = node.getAttribute('href');
                                if (href.startsWith('http')) {
                                    // Let VS Code handle external links
                                    return;
                                }
                                if (href.startsWith('#')) {
                                    return; // Internal page anchor
                                }
                                // It's a local file link
                                event.preventDefault();
                                vscode.postMessage({ command: 'openLink', href });
                                return;
                            }
                            node = node.parentNode;
                        }
                    });
                </script>
            </body>
            </html>`;
    }

    public dispose() {
        // Remove from the panels map
        MarkdownPreviewPanel._panels.delete(this._currentDocumentUri.fsPath);
        if (MarkdownPreviewPanel._activePanel === this) {
            MarkdownPreviewPanel._activePanel = undefined;
        }
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
