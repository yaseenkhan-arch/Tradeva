
import { config } from "./config.js";

export function emailLayout({
  title,
  content,
  buttonText,
  buttonUrl,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
</head>

<body style="
margin:0;
padding:40px;
background:${config.backgroundColor};
font-family:Arial,sans-serif;
color:${config.textColor};
">

<table align="center" width="600" cellpadding="0" cellspacing="0"
style="
background:${config.cardBackground};
border-radius:12px;
padding:40px;
">

<tr>
<td align="center">

<img
src="${config.logo}"
width="70"
alt="Tradeva"
/>

<h1 style="margin-top:25px;">
${title}
</h1>

<div style="
font-size:16px;
line-height:1.7;
color:${config.textColor};
">

${content}

</div>

${
buttonText
? `
<p style="margin-top:35px;">
<a href="${buttonUrl}"
style="
background:${config.primaryColor};
color:white;
padding:14px 28px;
text-decoration:none;
border-radius:8px;
display:inline-block;
font-weight:bold;
">
${buttonText}
</a>
</p>
`
: ""
}

<hr style="
margin:40px 0;
border:none;
border-top:1px solid #334155;
">

<p style="
font-size:13px;
color:${config.mutedText};
">

Need help?
Contact us at
${config.supportEmail}

</p>

<p style="
font-size:12px;
color:${config.mutedText};
">

${config.copyright}

</p>

</td>
</tr>

</table>

</body>
</html>
`;
}
