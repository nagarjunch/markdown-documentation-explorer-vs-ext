import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import { Document } from 'flexsearch';
import { MarkdownPreviewPanel } from '../webview/MarkdownPreviewPanel';

interface SearchDocument {
    id: string; // The file fsPath
    title: string;
    content: string;
}

export class SearchEngine {
    private index: any;
    private indexedFiles: Set<string> = new Set();
    private documentsMap: Map<string, SearchDocument> = new Map();

    constructor() {
        this.initIndex();
    }

    private initIndex() {
        this.index = new Document({
            document: {
                id: 'id',
                index: ['title', 'content'],
                store: true
            },
            charset: 'latin:extra',
            tokenize: 'forward',
            cache: true,
            worker: false
        });
        this.indexedFiles.clear();
        this.documentsMap.clear();
    }

    public async initialize(files: vscode.Uri[]) {
        this.initIndex();
        await this.indexFiles(files);
    }

    public async reindex(files: vscode.Uri[]) {
        this.initIndex();
        await this.indexFiles(files);
    }

    private async indexFiles(files: vscode.Uri[]) {
        // Simple async indexing to avoid blocking UI thread completely
        for (const file of files) {
            try {
                const fsPath = file.fsPath;
                if (!this.indexedFiles.has(fsPath)) {
                    const content = await fs.promises.readFile(fsPath, 'utf8');
                    const title = path.basename(fsPath);
                    const doc: SearchDocument = { id: fsPath, title, content };

                    this.index.add(doc);
                    this.documentsMap.set(fsPath, doc);
                    this.indexedFiles.add(fsPath);
                }
            } catch (e) {
                console.error(`Failed to index ${file.fsPath}`, e);
            }
        }
    }

    public async showSearchQuickPick() {
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Search markdown documentation...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;

        quickPick.onDidChangeValue(async (value) => {
            if (!value) {
                quickPick.items = [];
                return;
            }

            // Perform search
            // Flexsearch Document.search returns an array of result objects per indexed field
            const results = this.index.search(value, { enrich: true, limit: 20 });

            const matchedIds = new Set<string>();
            const qpItems: vscode.QuickPickItem[] = [];

            for (const resultGroup of results) {
                const field = resultGroup.field; // 'title' or 'content'
                for (const hit of resultGroup.result) {
                    const id = hit.id as string;
                    if (!matchedIds.has(id)) {
                        matchedIds.add(id);
                        const doc = this.documentsMap.get(id);
                        if (doc) {
                            // try to extract a snippet
                            const snippet = this.getSnippet(doc.content, value);
                            qpItems.push({
                                label: `$(markdown) ${doc.title}`,
                                description: vscode.workspace.asRelativePath(id),
                                detail: snippet,
                                // store custom data on qpitem to use upon selection
                                ...({ uri: vscode.Uri.file(id), query: value } as any)
                            });
                        }
                    }
                }
            }

            quickPick.items = qpItems;
        });

        quickPick.onDidAccept(() => {
            const selection = quickPick.selectedItems[0] as any;
            if (selection && selection.uri) {
                // Open the document via our generic command and pass the search term
                vscode.commands.executeCommand('markdownExplorer.openPreview', selection.uri, selection.query);
            }
            quickPick.hide();
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    private getSnippet(content: string, query: string): string {
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const indexOf = lowerContent.indexOf(lowerQuery);

        if (indexOf === -1) return '';

        const start = Math.max(0, indexOf - 30);
        const end = Math.min(content.length, indexOf + query.length + 50);

        let snippet = content.substring(start, end).replace(/\n/g, ' ');
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        return snippet;
    }
}
