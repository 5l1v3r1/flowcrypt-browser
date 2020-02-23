/* ©️ 2016 - present FlowCrypt a.s. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { KeyCanBeFixed, KeyImportUi, UserAlert } from '../../../js/common/ui/key-import-ui.js';
import { Url } from '../../../js/common/core/common.js';
import { ApiErr } from '../../../js/common/api/error/api-error.js';
import { Assert } from '../../../js/common/assert.js';
import { BrowserMsg } from '../../../js/common/browser/browser-msg.js';
import { Catch } from '../../../js/common/platform/catch.js';
import { Gmail } from '../../../js/common/api/email-provider/gmail/gmail.js';
import { Ui } from '../../../js/common/browser/ui.js';
import { View } from '../../../js/common/view.js';
import { Xss } from '../../../js/common/platform/xss.js';
import { initPassphraseToggle } from '../../../js/common/ui/passphrase-ui.js';
import { PassphraseStore } from '../../../js/common/platform/store/passphrase-store.js';
import { AcctKeyStore } from '../../../js/common/platform/store/acct-key-store.js';

View.run(class AddKeyView extends View {

  private readonly acctEmail: string;
  private readonly parentTabId: string;
  private readonly keyImportUi = new KeyImportUi({ rejectKnown: true });
  private readonly gmail: Gmail;

  constructor() {
    super();
    const uncheckedUrlParams = Url.parse(['acctEmail', 'parentTabId']);
    this.acctEmail = Assert.urlParamRequire.string(uncheckedUrlParams, 'acctEmail');
    this.parentTabId = Assert.urlParamRequire.string(uncheckedUrlParams, 'parentTabId');
    this.gmail = new Gmail(this.acctEmail);
  }

  public render = async () => {
    await initPassphraseToggle(['input_passphrase']);
    this.keyImportUi.initPrvImportSrcForm(this.acctEmail, this.parentTabId);
    Xss.sanitizeRender('#spinner_container', Ui.spinner('green') + ' loading..');
    await this.loadAndRenderKeyBackupsOrRenderError();
    $('.source_selector').css('display', 'block');
    $('#spinner_container').text('');
  }

  public setHandlers = () => {
    $('.action_add_private_key').click(this.setHandlerPrevent('double', this.addPrivateKeyHandler));
    $('#input_passphrase').keydown(this.setEnterHandlerThatClicks('.action_add_private_key'));
  }

  private loadAndRenderKeyBackupsOrRenderError = async () => {
    try {
      const backups = await this.gmail.fetchKeyBackups();
      if (!backups.longids.backups.length) {
        $('label[for=source_backup]').text('Load from backup (no backups found)').css('color', '#AAA');
        $('#source_backup').prop('disabled', true);
      } else if (backups.longids.backupsNotImported.length) {
        $('label[for=source_backup]').text(`Load from backup (${backups.longids.backupsNotImported.length} new to import)`);
      } else {
        $('label[for=source_backup]').text(`Load from backup (${backups.longids.backups.length} already loaded)`).css('color', '#AAA');
        $('#source_backup').prop('disabled', true);
      }
    } catch (e) {
      if (ApiErr.isAuthPopupNeeded(e)) {
        BrowserMsg.send.notificationShowAuthPopupNeeded(this.parentTabId, { acctEmail: this.acctEmail });
      }
      $('label[for=source_backup]').text('Load from backup (error checking backups)').css('color', '#AAA');
      $('#source_backup').prop('disabled', true);
    }
  }

  private addPrivateKeyHandler = async (submitBtn: HTMLElement) => {
    if (submitBtn.className.includes('gray')) {
      await Ui.modal.warning('Please double check the pass phrase input field for any issues.');
      return;
    }
    try {
      const checked = await this.keyImportUi.checkPrv(this.acctEmail, String($('.input_private_key').val()), String($('.input_passphrase').val()));
      if (checked) {
        await AcctKeyStore.keysAdd(this.acctEmail, checked.normalized); // resulting new_key checked above
        await PassphraseStore.passphraseSave($('.input_passphrase_save').prop('checked') ? 'local' : 'session', this.acctEmail,
          checked.longid, checked.passphrase);
        BrowserMsg.send.reload(this.parentTabId, { advanced: true });
      }
    } catch (e) {
      if (e instanceof UserAlert) {
        return await Ui.modal.warning(e.message, Ui.testCompatibilityLink);
      } else if (e instanceof KeyCanBeFixed) {
        return await Ui.modal.error(`This type of key cannot be set as non-primary yet. Please write human@flowcrypt.com`, false, Ui.testCompatibilityLink);
      } else {
        Catch.reportErr(e);
        return await Ui.modal.error(`An error happened when processing the key: ${String(e)}\nPlease write at human@flowcrypt.com`, false, Ui.testCompatibilityLink);
      }
    }
  }
});
