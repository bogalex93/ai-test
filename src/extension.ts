// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';



export function activate(context: vscode.ExtensionContext) {

	const disposable = vscode.commands.registerTextEditorCommand('ai-test.writeUnitTests', async (textEditor: vscode.TextEditor) => {

		// Check if Copilot extension is installed and enabled
		const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');
		if (!copilotExtension || !copilotExtension.isActive) {
			vscode.window.showErrorMessage('GitHub Copilot extension is not installed or not active.');
			return;
		}

		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const currentFileName = activeEditor.document.fileName;
		if (!currentFileName.endsWith('.spec.ts')) {
			vscode.window.showErrorMessage('Please open a test file with .spec.ts extension.');
			return;
		}

		const testedTestFileName = currentFileName.replace('.spec.ts', '.ts');

		const document = await vscode.workspace.openTextDocument(testedTestFileName);

		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);

		const methodSymbols = symbols
			? symbols
				.flatMap(symbol => symbol.children)
				.filter(symbol => symbol.kind === vscode.SymbolKind.Method)
			: [];

		const selected = await vscode.window.showQuickPick(
			methodSymbols.map(symbol => ({
				label: `$(symbol-method) ${symbol.name}`,
				description: '',
				symbol
			})),
			{
				placeHolder: 'Select a method',
				ignoreFocusOut: true
			}
		);

		if (!selected) {
			return;
		}

		const symbolRange = selected.symbol.range;
		const symbolText = document.getText(symbolRange);

		vscode.window.showInformationMessage(`Writing jasmine unit tests for :\n${selected.symbol.name}`);

		const prompt = `Write jasmine unit tests for the following method, write only it functions, do not use describe:\n\n${symbolText}\n\n`;

		const [model] = await vscode.lm.selectChatModels({
			vendor: 'copilot'
		});
		let chatResponse: vscode.LanguageModelChatResponse | undefined;
		try {
			chatResponse = await model.sendRequest(
				[vscode.LanguageModelChatMessage.User(prompt)],
				{},
				new vscode.CancellationTokenSource().token
			);
		} catch (err) {
			if (err instanceof vscode.LanguageModelError) {
				console.log(err.message, err.code, err.cause);
			} else {
				throw err;
			}
			return;
		}

		try {
			// Stream the code into the editor as it is coming in from the Language Model
			for await (const fragment of chatResponse.text) {
				// Remove code block annotations like ```Typescript and ```
				const cleaned = fragment.replace(/```[tT]ypescript|```|typescript|javascript/gi, '');
				await textEditor.edit(edit => {
					const position = getCurrentPosition(textEditor);
					edit.insert(position, cleaned);
				});
			}
		} catch (err) {
			// async response stream may fail, e.g network interruption or server side error
			await textEditor.edit(edit => {
				const position = getCurrentPosition(textEditor);
				edit.insert(position, (<Error>err).message);
			});
		}

	});

	context.subscriptions.push(disposable);
}
function getCurrentPosition(textEditor: vscode.TextEditor): vscode.Position {
	const currentLineNumber = textEditor.selection.active.line;
	const lastLine = textEditor.document.lineAt(currentLineNumber);
	const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
	return position;
}



// This method is called when your extension is deactivated
export function deactivate() { }
