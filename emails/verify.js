const escAttr = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function verifyEmail({ name, verifyUrl }) {
  const href = escAttr(verifyUrl);

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>Verify your email</title>
<!--[if mso]>
<xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<!--<![endif]-->
<style type="text/css">
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #FFFFFF; }
  a { text-decoration: none; }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
  .footer-link a { color: #6B7280 !important; text-decoration: underline; }
  .raw-link a { color: #2563EB !important; word-break: break-all; }

  @media screen and (max-width: 600px) {
    .container { width: 100% !important; max-width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .headline { font-size: 26px !important; line-height: 34px !important; }
    .btn-td { width: 100% !important; }
    .btn-a { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    .stack-pad { padding-top: 20px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#FFFFFF;">

<div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; font-family:'Inter',Arial,Helvetica,sans-serif;">
  Confirm your email address to activate your Tradeva account.
</div>
<div style="display:none; max-height:0; overflow:hidden;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#FFFFFF;">
  <tr>
    <td align="center" style="padding:32px 12px 48px 12px;">

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px; background-color:#FFFFFF; border:1px solid #E5E7EB; border-radius:16px;">

        <!-- LOGO -->
        <tr>
          <td align="center" class="px" style="padding:44px 48px 0 48px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
              <tr>
                <td style="padding:0 8px 0 0;" valign="middle">
                  <img src="https://tradeva.app/logo-transparent.png" width="30" height="30" alt="Tradeva" style="display:block; width:30px; height:30px; border:0;" />
                </td>
                <td valign="middle" style="font-family:'Inter',Arial,Helvetica,sans-serif; font-size:19px; line-height:24px; font-weight:700; color:#111827; letter-spacing:-0.3px;">
                  Tradeva
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ACCENT LINE -->
        <tr>
          <td align="center" style="padding:16px 48px 0 48px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center">
              <tr>
                <td width="40" height="3" bgcolor="#2563EB" style="width:40px; height:3px; background-color:#2563EB; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- HEADLINE -->
        <tr>
          <td align="center" class="px" style="padding:28px 48px 0 48px; font-family:'Inter',Arial,Helvetica,sans-serif;">
            <h1 class="headline" style="margin:0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:30px; line-height:38px; font-weight:700; color:#111827; letter-spacing:-0.6px;">
              Verify your email
            </h1>
          </td>
        </tr>

        <!-- INTRO -->
        <tr>
          <td align="center" class="px" style="padding:16px 48px 0 48px; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; color:#6B7280;">
            <p style="margin:0 0 12px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; color:#111827; font-weight:500;">
              Hi ${name},
            </p>
            <p style="margin:0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; color:#6B7280;">
              Confirm this email address to activate your Tradeva account. It takes one click, and it keeps your trading journal secure.
            </p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" class="px" style="padding:32px 48px 0 48px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="width:auto;" class="btn-td">
              <tr>
                <td align="center" bgcolor="#2563EB" style="border-radius:10px;" class="btn-td">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px; v-text-anchor:middle; width:200px;" arcsize="21%" strokecolor="#2563EB" fillcolor="#2563EB">
                    <w:anchorlock/>
                    <center style="color:#FFFFFF; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold;">Verify Email</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${href}" class="btn-a" style="display:inline-block; padding:15px 40px; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:15px; line-height:18px; font-weight:600; color:#FFFFFF; background-color:#2563EB; border-radius:10px; text-decoration:none; mso-hide:all;">
                    Verify Email
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FALLBACK LINK -->
        <tr>
          <td align="center" class="px" style="padding:24px 48px 0 48px; font-family:'Inter',Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 6px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#6B7280;">
              Button not working? Paste this link into your browser:
            </p>
            <p class="raw-link" style="margin:0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#2563EB; word-break:break-all;">
              <a href="${href}" style="color:#2563EB; text-decoration:underline; word-break:break-all;">${href}</a>
            </p>
          </td>
        </tr>

        <!-- NOTICE -->
        <tr>
          <td class="px" style="padding:28px 48px 0 48px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%; background-color:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px;">
              <tr>
                <td style="padding:16px 18px; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:13px; line-height:21px; color:#6B7280;">
                  This link expires in 24 hours and can only be used once. If you didn&rsquo;t create a Tradeva account, you can safely ignore this email &mdash; nothing will be activated.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td class="px" style="padding:32px 48px 0 48px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;">
              <tr>
                <td height="1" bgcolor="#E5E7EB" style="height:1px; background-color:#E5E7EB; font-size:0; line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- HELP -->
        <tr>
          <td align="center" class="px" style="padding:26px 48px 44px 48px; font-family:'Inter',Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 6px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; font-weight:600; color:#111827;">
              Having trouble verifying?
            </p>
            <p style="margin:0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; color:#6B7280;">
              Reply to this email and we&rsquo;ll get you set up.
            </p>
          </td>
        </tr>

      </table>

      <!-- FOOTER -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px; max-width:600px;">
        <tr>
          <td align="center" class="px" style="padding:28px 48px 0 48px; font-family:'Inter',Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 4px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; font-weight:600; color:#6B7280;">
              Tradeva
            </p>
            <p style="margin:0 0 10px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#9CA3AF;">
              Trade Smarter. Track Every Trade.
            </p>
            <p class="footer-link" style="margin:0 0 10px 0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#6B7280;">
              <a href="mailto:support@tradeva.app" style="color:#6B7280; text-decoration:underline;">support@tradeva.app</a>
            </p>
            <p style="margin:0; font-family:'Inter',Arial,Helvetica,sans-serif; font-size:12px; line-height:19px; color:#9CA3AF;">
              &copy; 2026 Tradeva
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>
`;
}
