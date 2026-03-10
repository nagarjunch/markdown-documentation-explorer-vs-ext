import * as vscode from 'vscode';
import { WorkspaceIndexer, DocumentNode } from '../utils/workspaceIndexer';

export class WorkspaceTreeProvider implements vscode.TreeDataProvider<DocumentNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<DocumentNode | undefined | void> = new vscode.EventEmitter<DocumentNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DocumentNode | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceIndexer: WorkspaceIndexer) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DocumentNode): vscode.TreeItem {
        const collapsibleState = element.type === 'file'
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed;

        const treeItem = new vscode.TreeItem(element.label, collapsibleState);

        if (element.type === 'file') {
            treeItem.command = {
                command: 'markdownExplorer.openPreview',
                title: 'Open Markdown Preview',
                arguments: [element.uri]
            };
            treeItem.iconPath = new vscode.ThemeIcon('markdown');
            treeItem.contextValue = 'markdownFile';
        } else if (element.type === 'ai_group') {
            treeItem.iconPath = new vscode.ThemeIcon('hubot');
            treeItem.contextValue = 'aiFolder';
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'folder';
        }

        return treeItem;
    }

    getChildren(element?: DocumentNode): Thenable<DocumentNode[]> {
        if (!element) {
            // Root
            const tree = this.workspaceIndexer.getTree();
            return Promise.resolve(tree);
        }

        // Children of a folder
        return Promise.resolve(element.children || []);
    }
}
