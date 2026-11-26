import * as migration_20261113_123912_initial from './20261113_123912_initial';
import * as migration_20261113_214904_site_settings from './20261113_214904_site_settings';
import * as migration_20261116_212625_release_visibility from './20261116_212625_release_visibility';
import * as migration_20261118_165313_medien_alt from './20261118_165313_medien_alt';
import * as migration_20261122_230000_english_field_names from './20261122_230000_english_field_names';
import * as migration_20261122_233429_roles_accounts from './20261122_233429_roles_accounts';
import * as migration_20261122_234526_artists from './20261122_234526_artists';
import * as migration_20261122_235148_exhibition_editors from './20261122_235148_exhibition_editors';
import * as migration_20261122_235813_qr_settings from './20261122_235813_qr_settings';
import * as migration_20261125_183903_shop from './20261125_183903_shop';
import * as migration_20261125_202413_contributor_terms from './20261125_202413_contributor_terms';
import * as migration_20261125_202951_rights_confirmation from './20261125_202951_rights_confirmation';
import * as migration_20261126_190945_login_without_lock from './20261126_190945_login_without_lock';
import * as migration_20261126_191747_checkout_holds from './20261126_191747_checkout_holds';

export const migrations = [
  {
    up: migration_20261113_123912_initial.up,
    down: migration_20261113_123912_initial.down,
    name: '20261113_123912_initial',
  },
  {
    up: migration_20261113_214904_site_settings.up,
    down: migration_20261113_214904_site_settings.down,
    name: '20261113_214904_site_settings',
  },
  {
    up: migration_20261116_212625_release_visibility.up,
    down: migration_20261116_212625_release_visibility.down,
    name: '20261116_212625_release_visibility',
  },
  {
    up: migration_20261118_165313_medien_alt.up,
    down: migration_20261118_165313_medien_alt.down,
    name: '20261118_165313_medien_alt',
  },
  {
    up: migration_20261122_230000_english_field_names.up,
    down: migration_20261122_230000_english_field_names.down,
    name: '20261122_230000_english_field_names',
  },
  {
    up: migration_20261122_233429_roles_accounts.up,
    down: migration_20261122_233429_roles_accounts.down,
    name: '20261122_233429_roles_accounts',
  },
  {
    up: migration_20261122_234526_artists.up,
    down: migration_20261122_234526_artists.down,
    name: '20261122_234526_artists',
  },
  {
    up: migration_20261122_235148_exhibition_editors.up,
    down: migration_20261122_235148_exhibition_editors.down,
    name: '20261122_235148_exhibition_editors',
  },
  {
    up: migration_20261122_235813_qr_settings.up,
    down: migration_20261122_235813_qr_settings.down,
    name: '20261122_235813_qr_settings',
  },
  {
    up: migration_20261125_183903_shop.up,
    down: migration_20261125_183903_shop.down,
    name: '20261125_183903_shop',
  },
  {
    up: migration_20261125_202413_contributor_terms.up,
    down: migration_20261125_202413_contributor_terms.down,
    name: '20261125_202413_contributor_terms',
  },
  {
    up: migration_20261125_202951_rights_confirmation.up,
    down: migration_20261125_202951_rights_confirmation.down,
    name: '20261125_202951_rights_confirmation',
  },
  {
    up: migration_20261126_190945_login_without_lock.up,
    down: migration_20261126_190945_login_without_lock.down,
    name: '20261126_190945_login_without_lock',
  },
  {
    up: migration_20261126_191747_checkout_holds.up,
    down: migration_20261126_191747_checkout_holds.down,
    name: '20261126_191747_checkout_holds'
  },
];
