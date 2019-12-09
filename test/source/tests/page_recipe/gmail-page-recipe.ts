import { PageRecipe } from './abstract-page-recipe';
import { AvaContext } from '..';
import { ControllablePage, BrowserHandle } from '../../browser';
import { expect } from 'chai';

export class GmailPageRecipe extends PageRecipe {

  public static async openSecureCompose(t: AvaContext, gmailPage: ControllablePage, browser: BrowserHandle): Promise<ControllablePage> {
    await gmailPage.waitAndClick('@action-secure-compose', { delay: 1 });
    await gmailPage.waitAll('@container-new-message');
    const urls = await gmailPage.getFramesUrls(['/chrome/elements/compose.htm'], { sleep: 1 });
    expect(urls.length).to.equal(1);
    return await browser.newPage(t, urls[0]);
  }

  public static async getSubscribeDialog(t: AvaContext, gmailPage: ControllablePage, browser: BrowserHandle): Promise<ControllablePage> {
    await gmailPage.waitAll('@dialog-subscribe');
    const urls = await gmailPage.getFramesUrls(['/chrome/elements/subscribe.htm'], { sleep: 1 });
    expect(urls.length).to.equal(1);
    return await browser.newPage(t, urls[0]);
  }

  public static async closeInitialSetupNotif(gmailPage: ControllablePage) {
    await gmailPage.waitAndClick('@notification-successfully-setup-action-close');
  }

}