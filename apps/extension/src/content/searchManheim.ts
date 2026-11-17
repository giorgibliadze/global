import {registerManheimParser} from './manheim'
import {searchManheimAdapter} from './sourceAdapters'
// Reuse transport/prefetch orchestration; parsing remains source-specific.
export function registerSearchManheimParser(doc:Document=document){return registerManheimParser(doc,searchManheimAdapter)}
