/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { ApiErr } from '../../../js/common/api/error/api-error.js';
import { Assert } from '../../../js/common/assert.js';
import { KeyInfo } from '../../../js/common/core/pgp-key.js';
import { Lang } from '../../../js/common/lang.js';
import { PgpArmor } from '../../../js/common/core/pgp-armor.js';
import { PgpKey } from '../../../js/common/core/pgp-key.js';
import { Settings } from '../../../js/common/settings.js';
import { Ui } from '../../../js/common/browser/ui.js';
import { Url, Str } from '../../../js/common/core/common.js';
import { View } from '../../../js/common/view.js';
import { opgp } from '../../../js/common/core/pgp.js';
import { Rules } from '../../../js/common/rules.js';
import { Keyserver } from '../../../js/common/api/keyserver.js';
import { KeyStore } from '../../../js/common/platform/store/key-store.js';
import { PassphraseStore } from '../../../js/common/platform/store/passphrase-store.js';

View.run(class MyKeyUpdateView extends View {
  private readonly acctEmail: string;
  private readonly longid: string;
  private readonly showKeyUrl: string;
  private readonly inputPrivateKey = $('.input_private_key');
  private readonly prvHeaders = PgpArmor.headers('privateKey');
  private primaryKi: KeyInfo | undefined;
  private rules!: Rules;
  private keyserver!: Keyserver;

  constructor() {
    super();
    const uncheckedUrlParams = Url.parse(['acctEmail', 'longid', 'parentTabId']);
    this.acctEmail = Assert.urlParamRequire.string(uncheckedUrlParams, 'acctEmail');
    this.longid = Assert.urlParamRequire.optionalString(uncheckedUrlParams, 'longid') || 'primary';
    this.showKeyUrl = Url.create('my_key.htm', uncheckedUrlParams);
  }

  public render = async () => {
    this.rules = await Rules.newInstance(this.acctEmail);
    this.keyserver = new Keyserver(this.rules);
    [this.primaryKi] = await KeyStore.keysGet(this.acctEmail, [this.longid]);
    Assert.abortAndRenderErrorIfKeyinfoEmpty(this.primaryKi);
    $('.action_show_public_key').attr('href', this.showKeyUrl);
    $('.email').text(this.acctEmail);
    $('.longid').text(Str.spaced(this.primaryKi.longid)).attr('title', this.primaryKi.longid);
    this.inputPrivateKey.attr('placeholder', this.inputPrivateKey.attr('placeholder') + ' (' + this.primaryKi.longid + ')');
  }

  public setHandlers = () => {
    $('.action_update_private_key').click(this.setHandlerPrevent('double', () => this.updatePrivateKeyHandler()));
    $('.input_passphrase').keydown(this.setEnterHandlerThatClicks('.action_update_private_key'));
  }

  private storeUpdatedKeyAndPassphrase = async (updatedPrv: OpenPGP.key.Key, updatedPrvPassphrase: string) => {
    const storedPassphrase = await PassphraseStore.passphraseGet(this.acctEmail, this.primaryKi!.longid, true);
    await KeyStore.keysAdd(this.acctEmail, updatedPrv.armor());
    await PassphraseStore.passphraseSave('local', this.acctEmail, this.primaryKi!.longid, typeof storedPassphrase !== 'undefined' ? updatedPrvPassphrase : undefined);
    await PassphraseStore.passphraseSave('session', this.acctEmail, this.primaryKi!.longid, typeof storedPassphrase !== 'undefined' ? undefined : updatedPrvPassphrase);
    if (this.rules.canSubmitPubToAttester() && await Ui.modal.confirm('Public and private key updated locally.\n\nUpdate public records with new Public Key?')) {
      try {
        await Ui.modal.info(await this.keyserver.attester.updatePubkey(this.primaryKi!.longid, updatedPrv.toPublic().armor()));
      } catch (e) {
        ApiErr.reportIfSignificant(e);
        await Ui.modal.error(`Error updating public records:\n\n${ApiErr.eli5(e)}\n\n(but local update was successful)`);
      }
    }
    window.location.href = this.showKeyUrl;
  }

  private updatePrivateKeyHandler = async () => {
    const { keys: [uddatedKey] } = await opgp.key.readArmored(String(this.inputPrivateKey.val()));
    const { keys: [uddatedKeyEncrypted] } = await opgp.key.readArmored(String(this.inputPrivateKey.val()));
    const uddatedKeyPassphrase = String($('.input_passphrase').val());
    if (typeof uddatedKey === 'undefined') {
      await Ui.modal.warning(Lang.setup.keyFormattedWell(this.prvHeaders.begin, String(this.prvHeaders.end)), Ui.testCompatibilityLink);
    } else if (uddatedKey.isPublic()) {
      await Ui.modal.warning('This was a public key. Please insert a private key instead. It\'s a block of text starting with "' + this.prvHeaders.begin + '"');
    } else if (await PgpKey.longid(uddatedKey) !== await PgpKey.longid(this.primaryKi!.public)) {
      await Ui.modal.warning(`This key ${Str.spaced(await PgpKey.longid(uddatedKey) || 'err')} does not match your current key ${Str.spaced(this.primaryKi!.longid)}`);
    } else if (await PgpKey.decrypt(uddatedKey, uddatedKeyPassphrase) !== true) {
      await Ui.modal.error('The pass phrase does not match.\n\nPlease enter pass phrase of the newly updated key.');
    } else {
      if (await uddatedKey.getEncryptionKey()) {
        await this.storeUpdatedKeyAndPassphrase(uddatedKeyEncrypted, uddatedKeyPassphrase);
      } else { // cannot get a valid encryption key packet
        if ((await uddatedKey.verifyPrimaryKey() === opgp.enums.keyStatus.no_self_cert) || await PgpKey.usableButExpired(uddatedKey)) { // known issues - key can be fixed
          const fixedEncryptedPrv = await Settings.renderPrvCompatFixUiAndWaitTilSubmittedByUser(
            this.acctEmail, '.compatibility_fix_container', uddatedKeyEncrypted, uddatedKeyPassphrase, this.showKeyUrl
          );
          await this.storeUpdatedKeyAndPassphrase(fixedEncryptedPrv, uddatedKeyPassphrase);
        } else {
          await Ui.modal.warning(
            'Key update: This looks like a valid key but it cannot be used for encryption. Email human@flowcrypt.com to see why is that. We\'re prompt to respond.',
            Ui.testCompatibilityLink
          );
          window.location.href = this.showKeyUrl;
        }
      }
    }
  }
});
