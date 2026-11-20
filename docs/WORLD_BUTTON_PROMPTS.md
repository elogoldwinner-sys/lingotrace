# Action button art (Battle / Talk / Bag)

The three round buttons at the bottom right of the world use painted pictures when these files exist, and the old emoji until then:

    public/monster-quest/world/ui/btn-battle.png
    public/monster-quest/world/ui/btn-talk.png
    public/monster-quest/world/ui/btn-bag.png

Each is a transparent PNG, square, about 256x256 (shown at 74px). Keep the picture round and centred with a little empty margin.
The label ("Battle", "Talk", "Bag") and the keyboard key (F, E, B) are drawn by the game, so **no text or letters in the pictures**.
The game adds the motion itself (bobbing, hover lift, press squash, glow ring and shine while Talk is available, red glow on Battle),
and greys the picture when a button is not usable. Make one picture per button; no separate disabled version is needed.

## Style prompt (use for all three, then add the button line)

> Game UI button icon, hand-painted storybook mobile-game style, matching a cheerful cartoon fantasy adventure game with thick soft outlines,
> rich saturated colours and warm lighting. A single round medallion button seen straight on, a thick polished golden-brown wooden rim with
> small rivets, a glossy domed inner face, soft highlight at the top left, subtle shadow at the bottom. One bold simple symbol in the centre,
> readable at 70 pixels. Transparent background, no text, no letters, no numbers, no frame, no extra decorations, no floor shadow,
> centred, 1:1 square, 1024x1024.

## The three button lines

1. **Battle** - "Inner face: warm red-orange. Symbol: two crossed swords with golden hilts and a tiny sparkle where they cross."
2. **Talk** - "Inner face: friendly sky blue. Symbol: a white speech bubble with three small dots inside, and a tiny golden sparkle."
   (This button also serves Shop / Read / Open / Use, so keep the symbol general; the label changes in the game.)
3. **Bag** - "Inner face: warm golden yellow. Symbol: a brown leather explorer's backpack with a buckle and a little green leaf."

## After you generate them

Name them as above, remove the background if ChatGPT gives a white one (ask: "same image on a fully transparent background"),
and send me the three files, or drop them into the folder. Optional: a second Talk picture per action (shop bag / book / chest) is possible later.

## Keyboard shortcuts (already working)

E, Enter or Space = Talk / interact (same as the shop prompt) · F = Battle (search for a monster) · B = open the Bag.

## Run away button (encounter screen)

File: `public/monster-quest/world/ui/btn-run.png` (transparent PNG, ~256x256, shown at 64px). Until it exists the old pill button is used.
Use the same style prompt as above, with this line:

4. **Run away** - "Inner face: cool teal-green. Symbol: one cartoon running boot with three small speed lines behind it, leaning forward, plus a tiny puff of dust."

Keys: **R** twice (within 2 seconds) runs away; the first press turns the label into "Press R again", so a stray key never ends a capture.
In the bag or shop: **G** goes back to the game, **Esc** too, **B** closes the bag, **E** closes the shop.
