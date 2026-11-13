# Posting a clip with Claude in Chrome

The person's own signed-in Chrome does the posting, so no API keys, app reviews or developer accounts are needed.
You stop before the final button every time and post only after they say yes.

What they can paste:

> Post `<clip.mp4>` to my Instagram as a Reel and to my YouTube channel as a Short, with the caption in `<clip.txt>`.
> Use my Chrome. Show me before you press Share or Publish.

## Rules
- Only the accounts they're already signed in to. If a sign-in page appears, ask them to sign in themselves; never type a password.
- Never change account settings, link accounts, accept new terms or post anywhere they didn't name.
- Show them the finished post (a screenshot) and wait for a clear yes before Share / Publish, separately for each platform.
- Afterwards, tell them where it went (the link, or "shared to your Instagram").

## Instagram (instagram.com)
1. Open https://www.instagram.com/ and click **Create** (the + in the left bar), then **Post** if it asks.
2. Upload the mp4 into the dialog's file input ("Select from computer") with the file-upload tool.
3. If it says video posts are shared as reels, continue. On the crop step choose **Original** (the 9:16 frame) so
   nothing is cut off. **Next**, skip filters, **Next**.
4. Paste the caption and hashtags from the `.txt` (everything after its `Title:` line). Leave everything else as it is.
5. Stop and show them. On a yes, click **Share** and wait for "Your reel has been shared".

## YouTube Shorts (studio.youtube.com)
1. Open https://studio.youtube.com/ and click **Create** → **Upload videos**, then upload the mp4 into the file input.
2. **Title:** the `Title:` line of the `.txt` (100 characters at most). A vertical video under 3 minutes becomes a Short on its own.
3. **Description:** the caption and hashtags. **Audience:** "No, it's not made for kids". **Next** three times.
   If the Checks step reports a copyright claim (usually radio music), tell them before going on.
4. **Visibility:** Public. Stop and show them. On a yes, click **Publish** and copy the link it shows.

## No Claude in Chrome (ChatGPT, Codex or another agent)
Open both pages in their browser, tell them which file to drop in, and give them the caption to paste.
