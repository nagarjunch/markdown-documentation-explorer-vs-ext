import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { WorkspaceIndexer } from '../utils/workspaceIndexer';

export interface MkDocsNode {
    label: string;
    type: 'file' | 'folder';
    uri?: vscode.Uri;
    children?: MkDocsNode[];
}

export class MkDocsTreeProvider implements vscode.TreeDataProvider<MkDocsNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<MkDocsNode | undefined | void> = new vscode.EventEmitter<MkDocsNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<MkDocsNode | undefined | void> = this._onDidChangeTreeData.event;

    private tree: MkDocsNode[] = [];

    constructor(private workspaceIndexer: WorkspaceIndexer) {
        this.buildTree();
    }

    refresh(): void {
        this.buildTree();
    }

    private async buildTree() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const mkdocsFiles = await vscode.workspace.findFiles('**/mkdocs.yml', '**/node_modules/**');
        const newTree: MkDocsNode[] = [];

        for (const file of mkdocsFiles) {
            try {
                const fileContents = fs.readFileSync(file.fsPath, 'utf8');
                const data = yaml.load(fileContents) as any;

                if (data && data.nav) {
                    const workspaceRoot = path.dirname(file.fsPath);
                    const docsDir = path.join(workspaceRoot, data.docs_dir || 'docs');
                    const siteName = data.site_name || path.basename(workspaceRoot);

                    const siteNode: MkDocsNode = {
                        label: siteName,
                        type: 'folder',
                        children: this.parseNav(data.nav, docsDir)
                    };
                    newTree.push(siteNode);
                }
            } catch (e) {
                console.error(`Failed to parse ${file.fsPath}`, e);
            }
        }

        // If there's only one site, just show its children directly rather than nesting it
        if (newTree.length === 1 && newTree[0].children) {
            this.tree = newTree[0].children;
        } else {
            this.tree = newTree;
        }

        this._onDidChangeTreeData.fire();
    }

    private parseNav(navItem: any, docsDir: string): MkDocsNode[] {
        const nodes: MkDocsNode[] = [];

        if (Array.isArray(navItem)) {
            for (const item of navItem) {
                nodes.push(...this.parseNav(item, docsDir));
            }
        } else if (typeof navItem === 'object') {
            for (const key of Object.keys(navItem)) {
                const val = navItem[key];
                if (typeof val === 'string') {
                    // It's a file
                    const fileUri = vscode.Uri.file(path.join(docsDir, val));
                    nodes.push({
                        label: key,
                        type: 'file',
                        uri: fileUri
                    });
                } else if (Array.isArray(val) || typeof val === 'object') {
                    // It's a folder/group
                    nodes.push({
                        label: key,
                        type: 'folder',
                        children: this.parseNav(val, docsDir)
                    });
                }
            }
        } else if (typeof navItem === 'string') {
            // Un-titled document
            const fileUri = vscode.Uri.file(path.join(docsDir, navItem));
            nodes.push({
                label: path.basename(navItem),
                type: 'file',
                uri: fileUri
            });
        }

        return nodes;
    }

    getTreeItem(element: MkDocsNode): vscode.TreeItem {
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
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('folder');
            treeItem.contextValue = 'folder';
        }

        return treeItem;
    }

    getChildren(element?: MkDocsNode): Thenable<MkDocsNode[]> {
        if (!element) {
            return Promise.resolve(this.tree);
        }
        return Promise.resolve(element.children || []);
    }
}
