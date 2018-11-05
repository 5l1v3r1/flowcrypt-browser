/* © 2016-2018 FlowCrypt Limited. Limitations apply. Contact human@flowcrypt.com */

'use strict';

// todo - a few things are duplicated here, refactor

/// <reference path="../../../node_modules/@types/chrome/index.d.ts" />

import { Str, Value } from '../../common/common.js';
import { Store } from '../../common/store.js';
import { Injector } from '../../common/inject.js';
import { Notifications } from '../../common/notifications.js';
import { InboxElementReplacer } from './inbox_element_replacer.js';
import { GmailElementReplacer } from './gmail_element_replacer.js';
import { contentScriptSetupIfVacant, WebmailVariantObject } from './setup_webmail_content_script.js';
import { Api } from '../../common/api.js';
import { ContentScriptWindow, FcWindow } from '../../common/extension.js';
import { XssSafeFactory, Env } from '../../common/browser.js';
import { Catch } from '../../common/catch.js';

Catch.try(async () => {

  const gmailWebmailStartup = async () => {
    const replacePgElsIntervalMs = 1000;
    let replacePgpElsInterval: number;
    let replacer: GmailElementReplacer;
    let hostPageInfo: WebmailVariantObject;

    const getUserAccountEmail = (): undefined | string => {
      if (window.location.search.indexOf('&view=btop&') === -1) {  // when view=btop present, FlowCrypt should not be activated
        if (hostPageInfo.email) {
          return hostPageInfo.email;
        }
        const acctEmailLoadingMatch = $("#loading div.msg").text().match(/[a-z0-9._\-]+@[^…< ]+/gi);
        if (acctEmailLoadingMatch !== null) { // try parse from loading div
          return acctEmailLoadingMatch[0].trim().toLowerCase();
        }
        const emailFromAccountDropdown = $('div.gb_Cb > div.gb_Ib').text().trim().toLowerCase();
        if (Str.isEmailValid(emailFromAccountDropdown)) {
          return emailFromAccountDropdown;
        }
      }
    };

    const getInsightsFromHostVariables = () => {
      const insights: WebmailVariantObject = { newDataLayer: null, newUi: null, email: null, gmailVariant: null };
      $('body').append(['<script>', '(function() {', // xss-direct - not sanitized because adding a <script> in intentional here
        'const payload = JSON.stringify([String(window.GM_SPT_ENABLED), String(window.GM_RFT_ENABLED), String((window.GLOBALS || [])[10])]);',
        'const e = document.getElementById("FC_VAR_PASS");',
        'if (!e) {e = document.createElement("div");e.style="display:none";e.id="FC_VAR_PASS";document.body.appendChild(e)}',
        'e.innerText=payload;',
        '})();', '</script>'].join('')); // executed synchronously - we can read the vars below
      try {
        const extracted = JSON.parse($('body > div#FC_VAR_PASS').text()).map(String);
        if (extracted[0] === 'true') {
          insights.newDataLayer = true;
        } else if (extracted[0] === 'false') {
          insights.newDataLayer = false;
        }
        if (extracted[1] === 'true') {
          insights.newUi = true;
        } else if (extracted[1] === 'false') {
          insights.newUi = false;
        }
        if (Str.isEmailValid(extracted[2])) {
          insights.email = extracted[2].trim().toLowerCase();
        }
        if (insights.newDataLayer === null && insights.newUi === null && insights.email === null) {
          insights.gmailVariant = 'html';
        } else if (insights.newUi === false) {
          insights.gmailVariant = 'standard';
        } else if (insights.newUi === true) {
          insights.gmailVariant = 'new';
        }
      } catch (e) { } // tslint:disable-line:no-empty
      return insights;
    };

    const start = async (acctEmail: string, injector: Injector, notifications: Notifications, factory: XssSafeFactory, notifyMurdered: () => void) => {
      hijackGmailHotkeys();
      const storage = await Store.getAcct(acctEmail, ['addresses', 'google_token_scopes']);
      const canReadEmails = Api.gmail.hasScope(storage.google_token_scopes || [], 'read');
      injector.btns();
      replacer = new GmailElementReplacer(factory, acctEmail, storage.addresses || [acctEmail], canReadEmails, injector, notifications, hostPageInfo.gmailVariant);
      await notifications.showInitial(acctEmail);
      replacer.everything();
      replacePgpElsInterval = (window as ContentScriptWindow).TrySetDestroyableInterval(() => {
        if (typeof (window as FcWindow).$ === 'function') {
          replacer.everything();
        } else { // firefox will unload jquery when extension is restarted or updated
          clearInterval(replacePgpElsInterval);
          notifyMurdered();
        }
      }, replacePgElsIntervalMs);
    };

    const hijackGmailHotkeys = () => {
      const keys = Env.keyCodes();
      const unsecureReplyKeyShortcuts = [keys.a, keys.r, keys.A, keys.R, keys.f, keys.F];
      $(document).keypress(e => {
        Catch.try(() => {
          const causesUnsecureReply = Value.is(e.which).in(unsecureReplyKeyShortcuts);
          if (causesUnsecureReply && !$(document.activeElement).is('input, select, textarea, div[contenteditable="true"]') && $('iframe.reply_message').length) {
            e.stopImmediatePropagation();
            replacer.setReplyBoxEditable();
          }
        })();
      });
    };

    hostPageInfo = getInsightsFromHostVariables();
    await contentScriptSetupIfVacant({
      name: 'gmail',
      variant: hostPageInfo.gmailVariant,
      getUserAccountEmail,
      getUserFullName: () => $("div.gb_hb div.gb_lb").text() || $("div.gb_Fb.gb_Hb").text(),
      getReplacer: () => replacer,
      start,
    });
  };

  const inboxWebmailStartup = async () => {
    const replacePgpElementsIntervalMs = 1000;
    let replacePgpElsInterval: number;
    let replacer: InboxElementReplacer;
    let fullName = '';

    const start = async (acctEmail: string, injector: Injector, notifications: Notifications, factory: XssSafeFactory, notifyMurdered: () => void) => {
      const storage = await Store.getAcct(acctEmail, ['addresses', 'google_token_scopes']);
      const canReadEmails = Api.gmail.hasScope(storage.google_token_scopes || [], 'read');
      injector.btns();
      replacer = new InboxElementReplacer(factory, acctEmail, storage.addresses || [acctEmail], canReadEmails, injector, null);
      await notifications.showInitial(acctEmail);
      replacer.everything();
      replacePgpElsInterval = (window as ContentScriptWindow).TrySetDestroyableInterval(() => {
        if (typeof (window as FcWindow).$ === 'function') {
          replacer.everything();
        } else { // firefox will unload jquery when extension is restarted or updated
          clearInterval(replacePgpElsInterval);
          notifyMurdered();
        }
      }, replacePgpElementsIntervalMs);
    };

    await contentScriptSetupIfVacant({
      name: 'inbox',
      variant: 'standard',
      getUserAccountEmail: () => {
        const creds = $('div > div > a[href="https://myaccount.google.com/privacypolicy"]').parent().siblings('div');
        if (creds.length === 2 && creds[0].innerText && creds[1].innerText && Str.isEmailValid(creds[1].innerText)) {
          const acctEmail = creds[1].innerText.toLowerCase();
          fullName = creds[0].innerText;
          console.info('Loading for ' + acctEmail + ' (' + fullName + ')');
          return acctEmail;
        }
      },
      getUserFullName: () => fullName,
      getReplacer: () => replacer,
      start,
    });
  };

  if (window.location.host !== 'inbox.google.com') {
    await gmailWebmailStartup();
  } else {
    await inboxWebmailStartup(); // to be deprecated by Google in 2019
  }

})();
