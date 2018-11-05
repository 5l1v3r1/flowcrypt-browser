
/* © 2016-2018 FlowCrypt Limited. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { Ui, Env } from '../../../js/common/browser.js';
import { Store } from '../../../js/common/store.js';
import { BrowserMsg } from '../../../js/common/extension.js';
import { Catch } from '../../../js/common/catch.js';

Catch.try(async () => {

  Ui.event.protect();

  const urlParams = Env.urlParams(['acctEmail', 'parentTabId']); // placement: compose||settings
  const acctEmail = Env.urlParamRequire.string(urlParams, 'acctEmail');
  const parentTabId = Env.urlParamRequire.string(urlParams, 'parentTabId');

  const saveFooterIfHasSubscriptionAndRequested = async (requested: boolean, footer: string) => {
    const subscription = await Store.subscription();
    if (requested && subscription.active) {
      await Store.set(acctEmail, { email_footer: footer });
    }
  };

  const subscription = await Store.subscription();
  if (subscription.active) {
    const storage = await Store.getAcct(acctEmail, ['email_footer']);
    $('.input_email_footer').val(storage.email_footer as string);
    $('.user_subscribed').css('display', 'block');
  } else {
    $('.user_free').css('display', 'block');
    $('.action_upgrade').click(Ui.event.prevent('double', async target => {
      const newlyActive = await BrowserMsg.sendAwait(parentTabId, 'subscribe', {});
      if (newlyActive) {
        $('.user_subscribed').css('display', 'block');
        $('.user_free').css('display', 'none');
      }
    }));
  }

  $('.action_add_footer').click(Ui.event.prevent('double', async self => {
    await saveFooterIfHasSubscriptionAndRequested($('.input_remember').prop('checked'), $('.input_email_footer').val() as string); // is textarea
    BrowserMsg.send(parentTabId, 'set_footer', { footer: $('.input_email_footer').val() });
  }));

  $('.action_cancel').click(Ui.event.handle(() => BrowserMsg.send(parentTabId, 'close_dialog')));

})();
