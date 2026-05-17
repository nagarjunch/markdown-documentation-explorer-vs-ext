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

        // Search for both mkdocs.yml and mkdocs.yaml
        const mkdocsFiles = await vscode.workspace.findFiles('**/{mkdocs.yml,mkdocs.yaml}', '**/node_modules/**');
        const newTree: MkDocsNode[] = [];

        for (const file of mkdocsFiles) {
            try {
                const fileContents = fs.readFileSync(file.fsPath, 'utf8');
                const data = yaml.load(fileContents) as any;

                if (data) {
                    const workspaceRoot = path.dirname(file.fsPath);
                    const docsDir = path.join(workspaceRoot, data.docs_dir || 'docs');
                    const siteName = data.site_name || path.basename(workspaceRoot);

                    let children: MkDocsNode[];
                    if (data.nav) {
                        // Explicit nav defined — parse it
                        children = this.parseNav(data.nav, docsDir);
                    } else {
                        // No nav key — auto-discover from docs directory
                        children = this.scanDocsDir(docsDir);
                    }

                    if (children.length > 0) {
                        const siteNode: MkDocsNode = {
                            label: siteName,
                            type: 'folder',
                            children
                        };
                        newTree.push(siteNode);
                    }
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

    /**
     * Scans the docs directory to auto-generate navigation when no `nav` key
     * is defined in mkdocs.yml (mirrors MkDocs' default auto-nav behavior).
     */
    private scanDocsDir(docsDir: string): MkDocsNode[] {
        if (!fs.existsSync(docsDir)) {
            return [];
        }

        const nodes: MkDocsNode[] = [];

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(docsDir, { withFileTypes: true });
        } catch {
            return [];
        }

        // Sort: folders first, then files, both alphabetically
        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            const fullPath = path.join(docsDir, entry.name);

            if (entry.isDirectory()) {
                // Skip hidden directories
                if (entry.name.startsWith('.')) continue;

                const children = this.scanDocsDir(fullPath);
                if (children.length > 0) {
                    nodes.push({
                        label: entry.name,
                        type: 'folder',
                        children
                    });
                }
            } else if (entry.isFile() && /\.(md|mdx|markdown)$/i.test(entry.name)) {
                const fileUri = vscode.Uri.file(fullPath);
                // Use filename without extension as label, prettify index files
                let label = path.basename(entry.name, path.extname(entry.name));
                if (label.toLowerCase() === 'index') {
                    label = 'Home';
                }
                nodes.push({
                    label,
                    type: 'file',
                    uri: fileUri
                });
            }
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
