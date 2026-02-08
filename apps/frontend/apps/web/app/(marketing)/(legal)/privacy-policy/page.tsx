import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:privacyPolicy'),
  };
}

async function PrivacyPolicyPage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t('marketing:privacyPolicy')}
        subtitle={t('marketing:privacyPolicyDescription')}
      />

      <div className={'container mx-auto max-w-4xl py-8 px-4'}>
        <div className={'prose prose-slate dark:prose-invert max-w-none'}>
          <p className={'text-sm text-muted-foreground'}>
            Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>1. Introduction</h2>
            <p>
              Welcome to Dentia, operated by <strong>Dentia Lab Inc.</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). 
              We respect your privacy and are committed to protecting your personal data. 
              This privacy policy will inform you about how we look after your personal data when you visit 
              our website or use our services, and tell you about your privacy rights and how the law protects you.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>2. Data We Collect</h2>
            <p>We may collect, use, store and transfer different kinds of personal data about you:</p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li><strong>Identity Data:</strong> includes first name, last name, username or similar identifier.</li>
              <li><strong>Contact Data:</strong> includes email address and telephone numbers.</li>
              <li><strong>Technical Data:</strong> includes internet protocol (IP) address, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform.</li>
              <li><strong>Profile Data:</strong> includes your username and password, your interests, preferences, feedback and survey responses.</li>
              <li><strong>Usage Data:</strong> includes information about how you use our website and services.</li>
              <li><strong>Marketing and Communications Data:</strong> includes your preferences in receiving marketing from us and our third parties and your communication preferences.</li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>3. How We Use Your Data</h2>
            <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>To register you as a new customer and create your account</li>
              <li>To process and deliver your orders including managing payments, fees and charges</li>
              <li>To manage our relationship with you</li>
              <li>To improve our website, products/services, marketing or customer relationships</li>
              <li>To recommend products or services which may be of interest to you</li>
              <li>To comply with legal and regulatory requirements</li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>4. Meta/Facebook Integration</h2>
            <p>
              If you connect your account with Meta/Facebook services, we may access certain information from your 
              Meta/Facebook account in accordance with their authorization process. This may include:
            </p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>Your public profile information (name, profile picture)</li>
              <li>Your email address</li>
              <li>Information you choose to share through Meta&apos;s permissions</li>
            </ul>
            <p className={'mt-4'}>
              We use this information solely to provide and improve our services. You can disconnect the Meta/Facebook 
              integration at any time through your account settings.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>5. Data Retention</h2>
            <p>
              We will only retain your personal data for as long as necessary to fulfil the purposes we collected 
              it for, including for the purposes of satisfying any legal, accounting, or reporting requirements.
            </p>
            <p className={'mt-4'}>
              When determining the appropriate retention period for personal data, we consider the amount, nature, 
              and sensitivity of the personal data, the potential risk of harm from unauthorized use or disclosure, 
              the purposes for which we process your personal data, and applicable legal requirements.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>6. Your Rights</h2>
            <p>Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:</p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li><strong>Request access</strong> to your personal data</li>
              <li><strong>Request correction</strong> of your personal data</li>
              <li><strong>Request erasure</strong> of your personal data</li>
              <li><strong>Object to processing</strong> of your personal data</li>
              <li><strong>Request restriction</strong> of processing your personal data</li>
              <li><strong>Request transfer</strong> of your personal data</li>
              <li><strong>Right to withdraw consent</strong></li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>7. Data Deletion</h2>
            <p>
              You have the right to request deletion of your personal data at any time. To request deletion of your data:
            </p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>Log into your account and navigate to Settings &gt; Account &gt; Delete Account</li>
              <li>Contact us directly at privacy@dentia.com</li>
              <li>If you connected through Meta/Facebook, you can also request deletion through your Facebook settings</li>
            </ul>
            <p className={'mt-4'}>
              We will process your deletion request within 30 days. Some information may be retained for legal or 
              legitimate business purposes as permitted by law.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>8. Data Security</h2>
            <p>
              We have put in place appropriate security measures to prevent your personal data from being accidentally 
              lost, used or accessed in an unauthorized way, altered or disclosed. We limit access to your personal 
              data to those employees, agents, contractors and other third parties who have a business need to know.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>9. Third-Party Links</h2>
            <p>
              Our website may include links to third-party websites, plug-ins and applications. Clicking on those 
              links or enabling those connections may allow third parties to collect or share data about you. We do 
              not control these third-party websites and are not responsible for their privacy statements.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>10. International Transfers</h2>
            <p>
              We may transfer your personal data outside of your country. Whenever we transfer your personal data 
              out of your region, we ensure a similar degree of protection is afforded to it by implementing 
              appropriate safeguards.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>11. Children&apos;s Privacy</h2>
            <p>
              Our services are not intended for children under 13 years of age. We do not knowingly collect personal 
              information from children under 13. If you are a parent or guardian and believe we have collected 
              information from your child, please contact us immediately.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>12. Changes to This Privacy Policy</h2>
            <p>
              We may update our privacy policy from time to time. We will notify you of any changes by posting the 
              new privacy policy on this page and updating the &quot;Last Updated&quot; date at the top.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>13. Contact Us</h2>
            <p>
              If you have any questions about this privacy policy or our privacy practices, please contact us:
            </p>
            <ul className={'list-none mt-2 space-y-2'}>
              <li><strong>Company:</strong> Dentia Lab Inc.</li>
              <li><strong>Email:</strong> privacy@dentia.com</li>
              <li><strong>Website:</strong> https://dentia.com/contact</li>
            </ul>
          </section>

          <section className={'mt-8 p-4 bg-muted rounded-lg'}>
            <h3 className={'text-lg font-semibold mb-2'}>For Meta/Facebook Users</h3>
            <p>
              If you signed in through Meta/Facebook and want to delete your data, you can:
            </p>
            <ol className={'list-decimal pl-6 mt-2 space-y-2'}>
              <li>Go to your Facebook Settings &gt; Apps and Websites</li>
              <li>Find Dentia in the list</li>
              <li>Click &quot;Remove&quot; or request data deletion</li>
              <li>Your deletion request will be processed automatically through our system</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

export default withI18n(PrivacyPolicyPage);
