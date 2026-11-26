// Withdrawal function on /withdrawal (Art. 11a Directive 2011/83/EU): sends the form to
// /shop/withdrawal and shows the time of receipt.
//
// Needs:    elements.js (createParagraph), cart-store.js (shopRequest)
// Provides: –

function setupWithdrawalForm() {
  const form = document.getElementById("withdrawal_form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = form.querySelector(".form_message");
    const button = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());

    button.disabled = true;
    message.hidden = true;

    try {
      const result = await shopRequest("/shop/withdrawal", data);
      const received = new Date(result.received).toLocaleString("en-GB");

      form.replaceChildren(
        createParagraph(
          "shop_form_done",
          "Your withdrawal from order " +
            String(data.orderNumber).trim().toUpperCase() +
            " was received on " +
            received +
            ". " +
            (result.note || "You will receive an acknowledgement by e-mail. Please send the goods back within 14 days."),
        ),
      );
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
      button.disabled = false;
    }
  });
}

setupWithdrawalForm();
