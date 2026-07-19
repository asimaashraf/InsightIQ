import genericActions from '../genericActions';
import githubActions from './githubActions';

export default function registerDefaultActions(register: (action: any) => void) {
  genericActions.forEach((a) => register(a));
  githubActions.forEach((a) => register(a));
}