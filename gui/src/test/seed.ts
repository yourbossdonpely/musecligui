export function seedProject() {
  localStorage.clear();
  localStorage.setItem('muse_projects', JSON.stringify([{ id: 1, name: 'P', path: 'C:\\p', sessions: [{ id: 2, sid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'S1', time: 't', messages: [] }] }]));
  localStorage.setItem('muse_selected', JSON.stringify({ p: 1, s: 2 }));
}