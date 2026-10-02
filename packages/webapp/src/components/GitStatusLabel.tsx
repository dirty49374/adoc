import { GitBranch } from 'lucide-react';

/** _Git_Status_Label_: a git icon with "git" or "no git", beside the connection status. */
export function GitStatusLabel({ git }: { git: boolean }) {
  return (
    <span className={`git-status ${git ? 'present' : 'absent'}`} data-testid="git-status" title={git ? 'The workspace is in a git repository' : 'The workspace is not in a git repository'}>
      <GitBranch />
      {git ? 'git' : 'no git'}
    </span>
  );
}
