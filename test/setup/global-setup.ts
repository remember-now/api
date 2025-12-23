import 'tsconfig-paths/register';

import { TestSetup } from './test-setup';

export default async function globalSetup() {
  await TestSetup.setupApp();
}
