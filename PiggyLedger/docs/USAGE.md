# Using PiggyLedger

PiggyLedger is a tracking and teaching tool, not a real bank or payment app —
no real money ever moves through it. It's meant to help young kids build
intuition for two ideas: (1) money you save adds up, and (2) money that earns
interest grows on its own over time. Parents record real-world cash
transactions here so kids have a running, always-up-to-date picture of their
account.

## For parents

### Getting started

Open your site's URL and click **View Family Home**, or go straight to
`parent.html`. The first time, click **+ Add a kid** for each child — give
them a name, pick an avatar and color, and save. Each kid gets their own
bookmarkable link shown right on their card (`Bookmark for <name>'s device`).

### Recording allowance or gift money

When your child earns or receives cash — allowance, a birthday gift, money
for chores — click **+ Add Money** on their card, enter the dollar amount, and
optionally jot down what it was for (e.g. "Birthday money from Grandma").
This is just a label for your own records; it doesn't affect anything else.

### Recording a purchase

When your child spends some of their saved cash, click **− Spend**, enter the
amount, and this time the note is **required** — e.g. "Comic book" or "Toy at
the fair." Requiring a note is intentional: it's a small nudge to talk with
your kid about the purchase, and it gives them a readable spending history
later. If a spend would take the balance negative, you'll get a confirmation
prompt first — useful as a check when a kid wants to spend more than they
currently have saved.

### Setting an interest rate

Open a kid's **⚙ Settings** panel and set **Annual interest rate (%)**. Interest
compounds daily on whatever balance is sitting in the account, and is applied
automatically the next time anyone opens the app (no need to run anything
manually). A realistic starter rate to model real savings accounts is
somewhere in the 1–5% range, but you can set anything — some families use a
deliberately generous rate (like 10–20%) to make the "money grows over time"
lesson land faster for younger kids.

### Automating a recurring allowance

In the same Settings panel:

1. Set **Allowance amount ($)** and **Allowance frequency** (weekly,
   biweekly, or monthly).
2. Turn on the **Automate allowance** toggle.
3. Click **Save settings**.

The panel then shows a **Next payment** date. From then on, the allowance is
paid automatically and caught up the moment anyone — you or your kid — opens
either the parent dashboard or the kid's page; there's nothing to remember to
click each week. If you ever want to trigger it manually (e.g. to check it's
working, or to catch up before your kid checks their balance), click **▶ Run
allowance & interest now**.

### Turning on the parent PIN

By default, the parent dashboard opens with no password — handy when you're
the only one who'd ever open it, but not ideal if it's bookmarked on a shared
family tablet or computer. To lock it down:

1. In **Family settings**, turn on **Require a PIN to open this dashboard**.
2. Enter a 4–8 digit PIN and click **Save PIN**.
3. Click **Save family settings**.

From then on, opening the parent dashboard on that device asks for the PIN
first. This is a light convenience lock meant to keep curious kids from
poking around, not a substitute for real device security — see
`docs/SETUP.md` → "Understanding the security model" for the full picture and
how to layer on stronger protection later if you want it.

### Removing a kid

Click the 🗑 icon on their card. You'll be asked to confirm, since this
permanently deletes their balance and full transaction history.

---

## For kids

### Finding your account

Ask a parent for your PiggyLedger link — it works from any browser or device,
including a Fire tablet, with no login or password needed. Once you open it,
**bookmark it** (or add it to your tablet's home screen) so you can get back
to it with one tap next time.

### Checking your balance

Your page shows your current balance right at the top, plus two badges: how
much interest your savings earns per year, and how much allowance you get and
how often (if your parents have turned that on). Below that, **Recent
activity** lists every time money was added or spent, with the reason your
parent wrote down and your balance after each one.

### Playing with "What if I saved my money?"

This is the fun part — a "time machine" for your savings. Pick how far into
the future you want to look (1 month, 3 months, 6 months, 1 year, or 5
years), and it shows you what your balance would grow to *if you didn't spend
any of it*, just from interest.

Check the **Include my future allowance too** box to also add in every
allowance payment you'd receive between now and then — this is a great way to
see how saving up over time, plus regular allowance, adds up to way more than
either one alone.

Nothing you do here changes your real balance — it's just a "what if"
calculator to help you picture the future. Try comparing 1 month vs. 5 years
to see how much of a difference time makes when your money is earning
interest!
