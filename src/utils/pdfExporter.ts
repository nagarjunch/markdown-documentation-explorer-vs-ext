import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import MarkdownIt from 'markdown-it';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItAdmonition from 'markdown-it-admonition';
import markdownItFootnote from 'markdown-it-footnote';
import hljs from 'highlight.js';
import puppeteer from 'puppeteer-core';

/**
 * Finds a Chrome/Chromium/Edge executable on the system.
 */
function findBrowserExecutable(): string | undefined {
    const platform = os.platform();

    const candidates: string[] = [];

    if (platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
        );
    } else if (platform === 'win32') {
        const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env['LOCALAPPDATA'] || '';

        candidates.push(
            path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        );
    } else {
        // Linux
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/snap/bin/chromium'
        );
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Builds a self-contained HTML document from markdown content, suitable for PDF rendering.
 * @param markdownContent Raw markdown string
 * @param title Document title
 * @param baseDirPath Absolute path to the directory containing the markdown file (for resolving relative images)
 */
function buildHtmlForPdf(markdownContent: string, title: string, baseDirPath: string): string {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                } catch (__) { }
            }
            return '';
        }
    })
        .use(markdownItTaskLists)
        .use(markdownItAdmonition)
        .use(markdownItFootnote);

    // Custom fence rendering for mermaid blocks
    const defaultFenceRender = md.renderer.rules.fence || function (tokens: any, idx: any, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.fence = function (tokens: any, idx: any, options: any, env: any, self: any) {
        const token = tokens[idx];
        if (token.info.trim() === 'mermaid') {
            return `<div class="mermaid">\n${token.content}</div>\n`;
        }
        return defaultFenceRender(tokens, idx, options, env, self);
    };

    // Custom image rendering: resolve local image paths to absolute file:// URIs
    const defaultImageRender = md.renderer.rules.image || function (tokens: any, idx: any, options: any, env: any, self: any) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.image = function (tokens: any, idx: any, options: any, env: any, self: any) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        if (srcIndex >= 0) {
            const src = token.attrs![srcIndex][1];
            if (!src.startsWith('http') && !src.startsWith('data:')) {
                const absPath = path.resolve(baseDirPath, src);
                token.attrs![srcIndex][1] = `file://${absPath}`;
            }
        }
        return defaultImageRender(tokens, idx, options, env, self);
    };

    const htmlBody = md.render(markdownContent);

    // Check if there are mermaid diagrams
    const hasMermaid = markdownContent.includes('```mermaid');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github.min.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif;
            color: #24292e;
            max-width: 900px;
            margin: 0 auto;
            padding: 30px 40px;
            font-size: 14px;
            line-height: 1.6;
        }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }
        code {
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            padding: 0.2em 0.4em;
            font-size: 85%;
            background-color: rgba(27,31,35,0.05);
            border-radius: 3px;
        }
        pre {
            background-color: #f6f8fa;
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            border-radius: 6px;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 16px;
        }
        table th, table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
        }
        table tr:nth-child(2n) {
            background-color: #f6f8fa;
        }
        table th {
            font-weight: 600;
            background-color: #f1f3f5;
        }
        blockquote {
            padding: 0 1em;
            color: #6a737d;
            border-left: 0.25em solid #dfe2e5;
            margin: 0 0 16px 0;
        }
        hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
        }
        img {
            max-width: 100%;
            height: auto;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        .admonition {
            padding: 15px;
            margin-bottom: 21px;
            border-left: 4px solid #0366d6;
            background-color: #f1f8ff;
            border-radius: 2px;
        }
        .admonition-title {
            margin: -15px -15px 15px -15px;
            padding: 10px 15px;
            background-color: rgba(3,102,214,0.1);
            border-bottom: 1px solid rgba(3,102,214,0.1);
            font-weight: bold;
        }
        ul.contains-task-list {
            list-style-type: none;
            padding-left: 30px;
        }
        .task-list-item-checkbox {
            margin-right: 0.5em;
        }
        /* Force all details/summary sections open for PDF */
        details {
            border: 1px solid #e1e4e8;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 16px;
        }
        details summary {
            cursor: pointer;
            font-weight: bold;
        }
        /* Mermaid diagram containers */
        .mermaid {
            text-align: center;
            margin: 16px 0;
        }
        .mermaid svg {
            max-width: 100%;
        }
        @media print {
            body { padding: 0; }
        }
    </style>
    ${hasMermaid ? `<script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        await mermaid.run();
        window.__mermaidReady = true;
    </script>` : `<script>window.__mermaidReady = true;</script>`}
</head>
<body>
    ${htmlBody}
    <script>
        // Force all details elements open
        document.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
    </script>
</body>
</html>`;
}

/**
 * Export a markdown file to PDF.
 */
export async function exportAsPdf(documentUri: vscode.Uri): Promise<void> {
    if (!documentUri || !documentUri.fsPath) {
        vscode.window.showErrorMessage('No valid markdown file path provided for PDF export.');
        return;
    }

    const browserPath = findBrowserExecutable();

    if (!browserPath) {
        vscode.window.showErrorMessage(
            'Could not find Chrome, Chromium, or Edge on your system. Please install one to use PDF export.'
        );
        return;
    }

    // Ask user for save location
    const defaultName = path.basename(documentUri.fsPath, '.md') + '.pdf';
    const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(path.dirname(documentUri.fsPath), defaultName)),
        filters: { 'PDF Files': ['pdf'] },
        title: 'Export Markdown as PDF'
    });

    if (!saveUri) {
        return; // User cancelled
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting to PDF...',
            cancellable: false
        },
        async () => {
            try {
                // Read markdown content
                const markdownContent = fs.readFileSync(documentUri.fsPath, 'utf8');
                const title = path.basename(documentUri.fsPath, '.md');
                const baseDirPath = path.dirname(documentUri.fsPath);
                const htmlContent = buildHtmlForPdf(markdownContent, title, baseDirPath);

                // Write temp HTML file in the SAME directory as the markdown file
                // so that any remaining relative paths (CSS, fonts, etc.) still resolve
                const tmpHtml = path.join(baseDirPath, `.md-export-${Date.now()}.html`);
                fs.writeFileSync(tmpHtml, htmlContent, 'utf8');

                // Launch browser and generate PDF
                const browser = await puppeteer.launch({
                    executablePath: browserPath,
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--allow-file-access-from-files'
                    ]
                });

                const page = await browser.newPage();
                await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle0', timeout: 60000 });

                // Wait for mermaid diagrams to finish rendering (up to 15s)
                await page.waitForFunction('window.__mermaidReady === true', { timeout: 15000 }).catch(() => {
                    // If mermaid didn't finish in time, proceed anyway
                    console.log('Mermaid rendering timed out, proceeding with PDF generation');
                });

                // Force-expand all details/summary and give a moment for reflow
                await page.evaluate(() => {
                    document.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
                });
                await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

                await page.pdf({
                    path: saveUri.fsPath,
                    format: 'A4',
                    printBackground: true,
                    margin: {
                        top: '20mm',
                        bottom: '20mm',
                        left: '15mm',
                        right: '15mm'
                    }
                });

                await browser.close();

                // Clean up temp file
                try { fs.unlinkSync(tmpHtml); } catch (_) { }

                vscode.window.showInformationMessage(`PDF exported successfully: ${path.basename(saveUri.fsPath)}`);
            } catch (err: any) {
                vscode.window.showErrorMessage(`PDF export failed: ${err.message || err}`);
            }
        }
    );
}
