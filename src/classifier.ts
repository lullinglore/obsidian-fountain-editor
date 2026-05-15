import {LINE_TOKENS, TOKEN_NAMES as n} from "./editor/consts.js";
import {type FountainContext, type FountainState} from "./editor/interface.js";
import {type FountainEditorSettings} from "./settings.js";

export type ClassifiedLine = {
	text: string;
	tokenType: string | null;
};

function handleEmptyLine(line: string, state: FountainState): boolean {
	if (line.trim()) return false;
	if (line.length < 2) state.inDialogue = false;
	return true;
}

function handleCommentBlock(line: string, state: FountainState): boolean {
	if (state.inCommentBlock) {
		if (line.includes("%%")) state.inCommentBlock = false;
		return true;
	}
	if (line.includes("%%")) {
		state.inCommentBlock = true;
		return true;
	}
	return false;
}

function handleToken(
	tId: string,
	state: FountainState,
	context: FountainContext,
): string | null {
	if (tId === n.fBoneyardEnd) state.inBoneyard = false;
	if (state.inBoneyard) return n.boneyard;
	if (tId === n.fBoneyardStart) {
		state.inDialogue = false;
		state.inBoneyard = true;
	}
	if (tId === n.character) {
		if (
			context.afterEmptyLine &&
			!context.beforeEmptyLine &&
			!context.isLastLine
		) {
			state.inDialogue = true;
		} else {
			return null;
		}
	}
	if (tId === n.parenthetical && !state.inDialogue) return null;
	if (tId === n.transition && !(context.afterEmptyLine && context.beforeEmptyLine))
		return null;
	return tId;
}

function classifyLine(
	line: string,
	state: FountainState,
	context: FountainContext,
	settings: FountainEditorSettings,
): string | null {
	if (handleEmptyLine(line, state)) return null;
	if (handleCommentBlock(line, state)) return null;

	for (const {id: tId, regex: tRegex} of LINE_TOKENS) {
		if (tRegex.test(line)) {
			const token = handleToken(tId, state, context);
			if (
				settings.preferObsidianBlockquote &&
				token === n.transition &&
				line.startsWith(">")
			) {
				return null;
			}
			if (token !== null) return token;
		}
	}

	if (state.inDialogue) return n.dialogue;
	if (state.inBoneyard) return n.boneyard;
	if (line.startsWith(">")) return null;
	return n.action;
}

export function classifyLines(
	source: string,
	settings: FountainEditorSettings,
): ClassifiedLine[] {
	const lines = source.split("\n");
	const result: ClassifiedLine[] = [];
	const state: FountainState = {
		inDialogue: false,
		inBoneyard: false,
		inCommentBlock: false,
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const context: FountainContext = {
			afterEmptyLine: i === 0 || lines[i - 1].trim() === "",
			beforeEmptyLine:
				i === lines.length - 1 || lines[i + 1].trim() === "",
			isLastLine: i === lines.length - 1,
		};
		result.push({text: line, tokenType: classifyLine(line, state, context, settings)});
	}

	return result;
}
