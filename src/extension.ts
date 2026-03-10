import * as vscode from 'vscode';
import { WorkspaceTreeProvider } from './tree/WorkspaceTreeProvider';
import { MkDocsTreeProvider } from './tree/MkDocsTreeProvider';
import { MarkdownPreviewPanel } from './webview/MarkdownPreviewPanel';
import { SearchEngine } from './search/SearchEngine';
import { WorkspaceIndexer } from './utils/workspaceIndexer';

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
