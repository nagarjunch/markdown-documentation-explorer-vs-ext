import * as vscode from 'vscode';
import { WorkspaceTreeProvider } from './tree/WorkspaceTreeProvider';
import { MkDocsTreeProvider } from './tree/MkDocsTreeProvider';
import { MarkdownPreviewPanel } from './webview/MarkdownPreviewPanel';
import { SearchEngine } from './search/SearchEngine';
import { WorkspaceIndexer } from './utils/workspaceIndexer';
import { exportAsPdf } from './utils/pdfExporter';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Markdown Explorer extension is now active!');

    const workspaceIndexer = new WorkspaceIndexer();
    const searchEngine = new SearchEngine();

    // Start indexing the workspace
    await workspaceIndexer.initialize();
    await searchEngine.initialize(workspaceIndexer.getAllDocuments());

    // Register Workspace Explorer Tree
    const workspaceTreeProvider = new WorkspaceTreeProvider(workspaceIndexer);
    vscode.window.registerTreeDataProvider('markdownExplorerView', workspaceTreeProvider);

    // Register MkDocs Explorer Tree if mkdocs.yml is found
    const mkdocsTreeProvider = new MkDocsTreeProvider(workspaceIndexer);
    vscode.window.registerTreeDataProvider('markdownMkdocsView', mkdocsTreeProvider);

    // Command: Open Preview
    // Command: Open Preview
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownExplorer.openPreview', (uri?: vscode.Uri, query?: string) => {
            const documentUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (documentUri) {
                MarkdownPreviewPanel.createOrShow(context.extensionUri, documentUri, query);
            } else {
                vscode.window.showInformationMessage('No Markdown file selected to preview.');
            }
        })
    );

    // Command: Edit Markdown
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownExplorer.editMarkdown', () => {
            const documentUri = MarkdownPreviewPanel.currentPanel?.documentUri;
            if (documentUri) {
                vscode.window.showTextDocument(documentUri, { preview: false, viewColumn: vscode.ViewColumn.Beside });
            } else {
                vscode.window.showInformationMessage('No Markdown file preview is currently open.');
            }
        })
    );

    // Command: Export as PDF
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownExplorer.exportPdf', async (uri?: any) => {
            let documentUri: vscode.Uri | undefined;

            // Only use the passed URI if it's a real vscode.Uri with a valid fsPath
            if (uri && uri instanceof vscode.Uri && typeof uri.fsPath === 'string') {
                documentUri = uri;
            }

            // Fallback: active preview panel
            if (!documentUri) {
                documentUri = MarkdownPreviewPanel.currentPanel?.documentUri;
            }
            // Fallback: active text editor
            if (!documentUri && vscode.window.activeTextEditor) {
                documentUri = vscode.window.activeTextEditor.document.uri;
            }
            // Fallback: ask user to pick a file
            if (!documentUri) {
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Markdown Files': ['md'] },
                    title: 'Select Markdown file to export as PDF'
                });
                if (picked && picked.length > 0) {
                    documentUri = picked[0];
                }
            }

            if (documentUri) {
                await exportAsPdf(documentUri);
            } else {
                vscode.window.showInformationMessage('No Markdown file selected to export.');
            }
        })
    );


    // Command: Search
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownExplorer.search', async () => {
            await searchEngine.showSearchQuickPick();
        })
    );

    // Command: Refresh
    context.subscriptions.push(
        vscode.commands.registerCommand('markdownExplorer.refresh', async () => {
            await workspaceIndexer.initialize();
            workspaceTreeProvider.refresh();
            mkdocsTreeProvider.refresh();
            await searchEngine.reindex(workspaceIndexer.getAllDocuments());
            vscode.window.showInformationMessage('Markdown Explorer: Refreshed!');
        })
    );

    // Refresh tree views on file changes
    workspaceIndexer.onDidChange(() => {
        workspaceTreeProvider.refresh();
        mkdocsTreeProvider.refresh();
        searchEngine.reindex(workspaceIndexer.getAllDocuments());
    });
}

export function deactivate() { }
