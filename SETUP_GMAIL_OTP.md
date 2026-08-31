.0.

# Gmail OTP setup for Fusion

The forgot-password feature sends the OTP from the Gmail account configured in `backend/.env`.

## 1. Enable Google 2-Step Verification

Open Google Account -> Security -> 2-Step Verification and turn it on.

## 2. Create a Gmail App Password

Open Google Account -> Security -> App passwords. Create an app password (for example, `Fusion Website`).

Do **not** use your normal Gmail password.

## 3. Configure backend/.env

Copy `backend/.env.example` to `backend/.env` and set:

```env
GMAIL_USER=yourgmail@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```

The Gmail account in `GMAIL_USER` is the sender. The recipient is automatically the admin email already stored in MongoDB. A reset request for an email that is not in the `User` collection will not send an OTP.

Never commit `.env` or share the App Password.

## 4. Install dependencies

```bash
npm install
```

Then start the backend normally.
