import * as vscode from 'vscode';
import * as path from 'path';

export interface DocumentNode {
    id: string;
    label: string;
    type: 'file' | 'folder' | 'ai_group';
    uri?: vscode.Uri;
    children?: DocumentNode[];
}

export class WorkspaceIndexer {
    private documents: DocumentNode[] = [];
    private allFiles: vscode.Uri[] = [];
    private _onDidChange = new vscode.EventEmitter<void>();
    public readonly onDidChange = this._onDidChange.event;

    private readonly AI_FOLDERS = ['.ai', '.cursor', '.bmad-methods', '.prompts', '.llm', 'ai-docs'];

    public async initialize() {
        await this.scanWorkspace();
        this.setupWatcher();
    }

    private async scanWorkspace() {
        const config = vscode.workspace.getConfiguration('markdownExplorer');
        const includeHidden = config.get<boolean>('includeHiddenFolders', true);

        // exclude out and node_modules, and hidden if configured so
        let excludePattern = '**/node_modules/**,**/out/**,**/dist/**';
        if (!includeHidden) {
            excludePattern += ',**/.*/**';
        }

        const files = await vscode.workspace.findFiles('**/*.{md,mdx,markdown}', `{${excludePattern}}`);
        this.allFiles = files;
        this.buildTree(files);
        this._onDidChange.fire();
    }

    private setupWatcher() {
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{md,mdx,markdown}');
        watcher.onDidCreate(() => this.scanWorkspace());
        watcher.onDidChange(() => this.scanWorkspace());
        watcher.onDidDelete(() => this.scanWorkspace());
    }

    public getTree(): DocumentNode[] {
        return this.documents;
    }

    public getAllDocuments(): vscode.Uri[] {
        return this.allFiles;
    }

    private buildTree(files: vscode.Uri[]) {
        const root: DocumentNode = { id: 'root', label: 'root', type: 'folder', children: [] };
        const aiGroup: DocumentNode = { id: 'ai_docs', label: 'AI Docs', type: 'ai_group', children: [] };

        // A helper to recursively find or create a folder node
        const getOrCreateFolder = (parent: DocumentNode, folderName: string, folderPath: string): DocumentNode => {
            if (!parent.children) { parent.children = []; }
            let node = parent.children.find(c => c.type === 'folder' && c.label === folderName);
            if (!node) {
                node = { id: folderPath, label: folderName, type: 'folder', children: [] };
                parent.children.push(node);
            }
            return node;
        };

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        files.forEach(file => {
            const relativePath = path.relative(workspaceRoot, file.fsPath);
            const parts = relativePath.split(path.sep);

            // Determine if it belongs to AI folder
            let isAiDoc = false;
            for (const part of parts) {
                if (this.AI_FOLDERS.includes(part)) {
                    isAiDoc = true;
                    break;
                }
            }

            let currentNode = isAiDoc ? aiGroup : root;
            let currentPath = '';

            for (let i = 0; i < parts.length - 1; i++) {
                currentPath = path.join(currentPath, parts[i]);
                currentNode = getOrCreateFolder(currentNode, parts[i], currentPath);
            }

            // Append File
            const fileName = parts[parts.length - 1];
            if (!currentNode.children) { currentNode.children = []; }
            currentNode.children.push({
                id: file.fsPath,
                label: fileName,
                type: 'file',
                uri: file
            });
        });

        // Add aiGroup if not empty
        if (aiGroup.children && aiGroup.children.length > 0) {
            if (!root.children) { root.children = []; }
            root.children.unshift(aiGroup);
        }

        this.documents = root.children || [];
    }
}
