import { settings } from '../packages/config.ts';
import { openStore } from '../packages/store/index.ts';
import { resetPreferences } from '../packages/store/preferences.ts';

const db = openStore();
try {
  resetPreferences(db, settings.customerId);
  console.log(
    'Cleared saved preferences for the current customer. ' +
    'Orders and chat threads were preserved. Start a new thread.',
  );
} finally {
  db.close();
}
