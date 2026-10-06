// Native entry: register the root component (AppRegistry 'main').
import { registerRootComponent } from 'expo';

import App from '../../App';

export function startApp(): void {
  registerRootComponent(App);
}
