import type { ChatMsg } from './types';

export function buildSessionMarkdown(project: string, session: string, messages: ChatMsg[]): string {
  let md = '# ' + project + ' — ' + session + '\n\n';
  for (const m of messages) {
    if (m.type === 'user') md += '## You\n' + m.text + '\n\n';
    else if (m.type === 'muse') md += '## Muse\n' + m.text + '\n\n';
    else md += '> ' + m.text + '\n\n';
  }
  return md;
}