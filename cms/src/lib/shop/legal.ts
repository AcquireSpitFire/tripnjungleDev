// Legal texts of the shop: terms (AGB) and the instructions on the right of withdrawal.
// Both can be replaced in Site settings → Shop; empty fields use the standard texts below,
// filled in from the legal notice. They are shown on /terms and /withdrawal and sent with every
// order confirmation (durable medium).
//
// Text format (admin textarea): blank line = new paragraph, "## " = heading,
// a block whose lines all start with "— " or "- " = list.
import type { Site } from '../../payload-types'
import { escapeHtml } from '../render-template'
import { serverUrl } from '../site-identity'
import { normalizeNewlines, operatorAddressLines, splitParagraphs } from '../text'
import { toShopSettings } from './settings'

const MISSING_OPERATOR = '[Name, address and e-mail – fill in under Site settings → Legal notice]'

function operatorLines(site: Site): string[] {
  return [
    ...operatorAddressLines(site),
    site.operatorEmail?.trim() ? 'E-mail: ' + site.operatorEmail.trim() : '',
    site.operatorPhone?.trim() ? 'Phone: ' + site.operatorPhone.trim() : '',
  ].filter(Boolean)
}

export function defaultWithdrawalText(site: Site): string {
  const lines = operatorLines(site)
  const operator = lines.length ? lines.join('\n') : MISSING_OPERATOR

  return `## Right of withdrawal

You have the right to withdraw from this contract within 14 days without giving any reason.

The withdrawal period will expire after 14 days from the day on which you acquire, or a third party other than the carrier and indicated by you acquires, physical possession of the goods. If you ordered several goods that are delivered separately, the period starts on the day on which you, or a third party other than the carrier and indicated by you, acquire physical possession of the last good.

To exercise the right of withdrawal, you must inform us

${operator}

of your decision to withdraw from this contract by an unequivocal statement (e.g. a letter sent by post or an e-mail). You can also use the withdrawal function on our website: ${serverUrl()}/withdrawal. You may use the model withdrawal form below, but it is not obligatory.

To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the right of withdrawal before the withdrawal period has expired.

## Effects of withdrawal

If you withdraw from this contract, we shall reimburse to you all payments received from you, including the costs of delivery (with the exception of the supplementary costs resulting from your choice of a type of delivery other than the least expensive type of standard delivery offered by us), without undue delay and in any event not later than 14 days from the day on which we are informed about your decision to withdraw from this contract. We will carry out such reimbursement using the same means of payment as you used for the initial transaction, unless you have expressly agreed otherwise; in any event, you will not incur any fees as a result of such reimbursement.

We may withhold reimbursement until we have received the goods back or you have supplied evidence of having sent back the goods, whichever is the earliest.

You shall send back the goods or hand them over to us without undue delay and in any event not later than 14 days from the day on which you communicate your withdrawal from this contract to us. The deadline is met if you send back the goods before the period of 14 days has expired.

You will have to bear the direct cost of returning the goods.

You are only liable for any diminished value of the goods resulting from the handling other than what is necessary to establish the nature, characteristics and functioning of the goods.

## Model withdrawal form

(Complete and return this form only if you wish to withdraw from the contract.)

— To: ${lines.length ? lines.join(', ') : MISSING_OPERATOR}
— I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale of the following goods (*):
— Ordered on (*) / received on (*):
— Order number:
— Name of consumer(s):
— Address of consumer(s):
— Signature of consumer(s) (only if this form is notified on paper):
— Date:

(*) Delete as appropriate.`
}

function defaultTermsText(site: Site): string {
  const name = site.operatorName?.trim() || '[Name – fill in under Site settings → Legal notice]'
  const law = site.jurisdiction === 'at' ? 'Austrian' : 'German'
  const base = serverUrl()

  return `## 1. Scope

These terms apply to all orders of prints placed on ${base} between ${name} (“we”, details in the legal notice: ${base}/imprint) and the buyer. Consumers are persons who conclude the contract for purposes outside their trade, business or profession.

## 2. Conclusion of the contract

The prints shown on the website are not a binding offer. You put the prints you want into the cart; there you see all items, the total price including shipping, the delivery time and these terms. On the following payment page of our payment provider Stripe you can still check and correct your details. By clicking the payment button you place a binding order. The contract is concluded with our order confirmation, which we send by e-mail right after the payment. The contract language is English. We store the contract text; you receive it with the order confirmation, together with these terms and the instructions on withdrawal.

## 3. Prices and shipping costs

All prices are final prices in euros. ${toShopSettings(site).vatNote}. Shipping costs depend on the country of delivery and are shown in the cart before you order. We only deliver to the countries offered in the cart.

## 4. Payment

Payment is handled by Stripe Payments Europe, Ltd., Ireland. The available payment methods are shown on the payment page. The amount is charged when you place the order; with delayed payment methods (e.g. SEPA direct debit) we ship once the payment has arrived.

## 5. Delivery

We ship the prints carefully packed to the address you entered. The delivery time is shown in the cart and starts with the receipt of payment. Limited editions are only available in the number of copies shown. Should a print not be deliverable despite the payment (e.g. damaged in production and not replaceable), we inform you immediately and refund the full amount.

## 6. Retention of title

The prints remain our property until they have been paid in full.

## 7. Right of withdrawal

As a consumer you have a statutory right of withdrawal of 14 days. Details, the model withdrawal form and the withdrawal function: ${base}/withdrawal.

## 8. Warranty

The statutory warranty rights apply. Please note: screens show colours differently, so the colours of the print may look slightly different from what you see on your screen. The watermark shown on the website is not part of the print. Please tell us about transport damage as soon as possible so that we can claim it from the carrier; your rights are not affected if you do not.

## 9. Copyright

You acquire ownership of the print, not rights of use of the photo. Copying, publishing or commercial use of the photo requires our written permission.

## 10. Dispute resolution

We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board.

## 11. Final provisions

${law} law applies, excluding the UN Convention on Contracts for the International Sale of Goods. For consumers, this choice of law only applies insofar as it does not deprive them of the protection of the mandatory provisions of the law of the country in which they have their habitual residence.`
}

export function termsText(site: Site): string {
  return site.termsText?.trim() || defaultTermsText(site)
}

export function withdrawalText(site: Site): string {
  return site.withdrawalText?.trim() || defaultWithdrawalText(site)
}

// Text format → HTML (every value escaped)
export function legalTextToHtml(text: string): string {
  return splitParagraphs(text)
    .map((block) => {
      if (block.startsWith('## ')) {
        return `<h2>${escapeHtml(block.slice(3).trim())}</h2>`
      }

      const lines = block.split('\n').map((line) => line.trim())

      if (lines.every((line) => /^(—|-)\s/.test(line))) {
        return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^(—|-)\s+/, ''))}</li>`).join('')}</ul>`
      }

      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`
    })
    .join('\n')
}

// Text format → plain text for e-mails ("## Heading" → "HEADING")
export function legalTextToPlain(text: string): string {
  return normalizeNewlines(text).replace(/^## (.*)$/gm, (_, heading: string) =>
    heading.toUpperCase(),
  )
}
