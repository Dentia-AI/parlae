import { SitePageHeader } from '~/(marketing)/_components/site-page-header';
import { createI18nServerInstance } from '~/lib/i18n/i18n.server';
import { withI18n } from '~/lib/i18n/with-i18n';

export async function generateMetadata() {
  const { t } = await createI18nServerInstance();

  return {
    title: t('marketing:termsOfService'),
  };
}

async function TermsOfServicePage() {
  const { t } = await createI18nServerInstance();

  return (
    <div>
      <SitePageHeader
        title={t(`marketing:termsOfService`)}
        subtitle={t(`marketing:termsOfServiceDescription`)}
      />

      <div className={'container mx-auto max-w-4xl py-8 px-4'}>
        <div className={'prose prose-slate dark:prose-invert max-w-none'}>
          <p className={'text-sm text-muted-foreground'}>
            Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Dentia (&quot;the Service&quot;) operated by <strong>Dentia Lab Inc.</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), 
              you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to 
              abide by the above, please do not use this service.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>2. Description of Service</h2>
            <p>
              Dentia provides an online platform for [describe your service]. We reserve the right to modify, 
              suspend, or discontinue the Service (or any part thereof) at any time, with or without notice. 
              We will not be liable to you or to any third party for any modification, suspension, or 
              discontinuance of the Service.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>3. User Accounts</h2>
            <h3 className={'text-xl font-semibold mt-4 mb-2'}>3.1 Account Creation</h3>
            <p>
              To use certain features of the Service, you must register for an account. When you register, 
              you agree to:
            </p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept all risks of unauthorized access to your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>3.2 Account Eligibility</h3>
            <p>
              You must be at least 13 years of age to use this Service. By agreeing to these Terms, 
              you represent that you are at least 13 years of age.
            </p>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>3.3 Account Termination</h3>
            <p>
              We reserve the right to suspend or terminate your account at any time for any reason, 
              including but not limited to violation of these Terms. You may also terminate your account 
              at any time through your account settings or by contacting us.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>4. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>Use the Service for any illegal purpose or in violation of any laws</li>
              <li>Violate or infringe other people&apos;s intellectual property, privacy, or other rights</li>
              <li>Post or transmit any content that is harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Attempt to gain unauthorized access to any portion of the Service or any other systems or networks</li>
              <li>Use any automated means to access the Service or collect information from the Service</li>
              <li>Engage in any activity that could damage, disable, overburden, or impair the Service</li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>5. Intellectual Property Rights</h2>
            <h3 className={'text-xl font-semibold mt-4 mb-2'}>5.1 Our Content</h3>
            <p>
              The Service and its original content, features, and functionality are owned by Dentia Lab Inc. and are 
              protected by international copyright, trademark, patent, trade secret, and other intellectual 
              property or proprietary rights laws.
            </p>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>5.2 Your Content</h3>
            <p>
              You retain ownership of any content you submit, post, or display on or through the Service. 
              By submitting, posting, or displaying content, you grant us a worldwide, non-exclusive, 
              royalty-free license to use, reproduce, modify, adapt, publish, and distribute such content 
              in connection with the Service.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>6. Payment and Billing</h2>
            <h3 className={'text-xl font-semibold mt-4 mb-2'}>6.1 Fees</h3>
            <p>
              Certain features of the Service may require payment of fees. You agree to pay all applicable 
              fees as described on the Service at the time you place your order.
            </p>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>6.2 Subscriptions</h3>
            <p>
              Some parts of the Service are billed on a subscription basis. You will be billed in advance 
              on a recurring and periodic basis (monthly or annually). Billing cycles are set either on a 
              monthly or annual basis, depending on the type of subscription plan you select.
            </p>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>6.3 Refunds</h3>
            <p>
              Unless otherwise required by law, paid subscription fees are non-refundable. You may cancel 
              your subscription at any time, but you will not receive a refund for any unused portion of 
              your subscription period.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>7. Third-Party Services</h2>
            <p>
              The Service may contain links to third-party websites or services that are not owned or 
              controlled by Dentia. This includes integrations with services such as Meta/Facebook, 
              payment processors, and other third-party platforms.
            </p>
            <p className={'mt-4'}>
              We have no control over, and assume no responsibility for, the content, privacy policies, 
              or practices of any third-party websites or services. You acknowledge and agree that we 
              shall not be responsible or liable for any damage or loss caused by or in connection with 
              the use of any such content, goods, or services.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>8. Meta/Facebook Integration</h2>
            <p>
              If you choose to connect your account with Meta/Facebook services:
            </p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>You agree to comply with Meta&apos;s Terms of Service and policies</li>
              <li>You authorize us to access certain information from your Meta/Facebook account as described in our Privacy Policy</li>
              <li>You can disconnect the integration at any time through your account settings</li>
              <li>We are not responsible for any changes to Meta/Facebook&apos;s terms, policies, or services that may affect your use of our Service</li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>9. Disclaimers and Limitation of Liability</h2>
            <h3 className={'text-xl font-semibold mt-4 mb-2'}>9.1 Disclaimers</h3>
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. WE DISCLAIM ALL 
              WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES 
              OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>

            <h3 className={'text-xl font-semibold mt-4 mb-2'}>9.2 Limitation of Liability</h3>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL DENTIA LAB INC. BE LIABLE FOR ANY INDIRECT, 
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, 
              WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER 
              INTANGIBLE LOSSES.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>10. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless Dentia Lab Inc. and its officers, directors, employees, 
              and agents from and against any claims, liabilities, damages, losses, and expenses, including 
              reasonable attorneys&apos; fees and costs, arising out of or in any way connected with:
            </p>
            <ul className={'list-disc pl-6 mt-2 space-y-2'}>
              <li>Your access to or use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party right, including any intellectual property right or privacy right</li>
              <li>Any content you submit or make available through the Service</li>
            </ul>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>11. Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy, which is incorporated into 
              these Terms by reference. Please review our Privacy Policy to understand our practices 
              regarding your personal data.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>12. Modifications to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. If we make material changes to 
              these Terms, we will notify you by email or by posting a notice on the Service prior to 
              the effective date of the changes.
            </p>
            <p className={'mt-4'}>
              By continuing to access or use the Service after those revisions become effective, you 
              agree to be bound by the revised Terms.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>13. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], 
              without regard to its conflict of law provisions. You agree to submit to the personal jurisdiction 
              of the courts located within [Your Jurisdiction] for the purpose of litigating all such claims.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>14. Dispute Resolution</h2>
            <p>
              Any dispute arising from or relating to the subject matter of these Terms shall be finally 
              settled by arbitration in [Your Jurisdiction], using the English language in accordance with 
              the Arbitration Rules and Procedures of [Arbitration Association] then in effect.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>15. Severability</h2>
            <p>
              If any provision of these Terms is held to be invalid or unenforceable, such provision shall 
              be struck and the remaining provisions shall be enforced to the fullest extent under law.
            </p>
          </section>

          <section className={'mt-8'}>
            <h2 className={'text-2xl font-semibold mb-4'}>16. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className={'list-none mt-2 space-y-2'}>
              <li><strong>Company:</strong> Dentia Lab Inc.</li>
              <li><strong>Email:</strong> legal@dentia.com</li>
              <li><strong>Website:</strong> https://dentia.com/contact</li>
            </ul>
          </section>

          <section className={'mt-8 p-4 bg-muted rounded-lg'}>
            <h3 className={'text-lg font-semibold mb-2'}>Important Notice</h3>
            <p>
              Please read these Terms carefully before using our Service. By using the Service, you 
              acknowledge that you have read, understood, and agree to be bound by these Terms and our 
              Privacy Policy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default withI18n(TermsOfServicePage);
