import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { PageHeader, useWide } from "../../components/shell/AppShell";
import { RestaurantMark } from "../../components/ui/DishArt";
import { Bar, Button, Card, Divider, Pill, SectionHeader, T } from "../../components/ui/primitives";
import { color, font } from "../../components/ui/theme";
import { cuisineNames, restaurantById } from "../../lib/agent/data/restaurants";
import { allergenNames, capitalize, moneyShort, plural, tagNames } from "../../lib/agent/format";
import { insights, rankedCuisines } from "../../lib/agent/learn";
import { relativeDay, fmtTime } from "../../lib/agent/time";
import type { Priority, Tag } from "../../lib/agent/types";
import { useNow, useStore } from "../../lib/store/StoreProvider";

const PRIORITY: Record<Priority, { label: string; text: string }> = {
  taste: { label: "Taste & quality", text: "Ratings, your favourites, cuisines you love" },
  health: { label: "Health", text: "Against your goal: high protein" },
  price: { label: "Price", text: "Everything in: menu, delivery and fees" },
  speed: { label: "Speed & timing", text: "Arriving when you asked, reliable platforms" },
};

export default function Taste() {
  const { state } = useStore();
  const wide = useWide();
  const now = useNow(60_000);
  const { profile, learned, orders } = state;
  const w = profile.weights;
  const keys = (Object.keys(w) as Priority[]).sort((a, b) => w[b] - w[a]);
  const cuisines = rankedCuisines(learned);
  const places = Object.entries(learned.restaurant).sort((a, b) => b[1].score - a[1].score);
  const tags = (Object.entries(learned.tags) as [Tag, { score: number; n: number }][]).filter(([t]) => !["vegan", "vegetarian", "gluten-free"].includes(t)).sort((a, b) => b[1].score - a[1].score);
  const found = insights(orders, profile, learned);
  const choice = learned.events.find((e) => e.kind === "choice");

  const left = (
    <View style={{ gap: 18 }}>
      <Card style={{ gap: 16 }}>
        <SectionHeader title="What matters to you" style={{ marginBottom: 0 }} />
        {keys.map((k) => (
          <View key={k} style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <View>
                <T variant="bodyStrong">{PRIORITY[k].label}</T>
                <T variant="caption">{k === "health" ? `Against your goal: ${profile.goal.replace("-", " ")}` : PRIORITY[k].text}</T>
              </View>
              <T style={{ fontFamily: font.display, fontSize: 26, color: color.ink }}>{Math.round(w[k] * 100)}%</T>
            </View>
            <Bar value={w[k] / w[keys[0]]} tone={k === keys[0] ? color.ink : "#7A766F"} />
          </View>
        ))}
        {choice ? (
          <View style={{ backgroundColor: color.greenSoft, borderRadius: 10, padding: 12 }}>
            <T variant="small" style={{ color: color.green }}>
              Adjusted {relativeDay(choice.at, now).toLowerCase()} at {fmtTime(choice.at)}: {choice.text.split(": ").slice(1).join(": ")}
            </T>
          </View>
        ) : (
          <T variant="caption">Set from your onboarding answers. Picking something other than Sous's first suggestion moves these.</T>
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <SectionHeader title="Rules Sous never breaks" style={{ marginBottom: 0 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {profile.allergies.map((a) => (
            <Pill key={a} label={`${allergenNames[a]} allergy`} tone="accent" />
          ))}
          {profile.dislikes.map((d) => (
            <Pill key={d} label={`No ${d}`} />
          ))}
          <Pill label={profile.diet === "omnivore" ? "Eats everything" : capitalize(profile.diet)} />
          <Pill label={`Lunch ≤ ${moneyShort(profile.budget.lunch)}`} />
          <Pill label={`Dinner ≤ ${moneyShort(profile.budget.dinner)}`} />
          <Pill label={`${moneyShort(profile.limits.perOrder)} per order`} tone="blue" />
        </View>
        <Button title="Edit in Settings" kind="secondary" size="sm" onPress={() => router.navigate("/settings")} style={{ alignSelf: "flex-start" }} />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionHeader title="Learning log" style={{ marginBottom: 0 }} />
        {learned.events.length ? (
          learned.events.slice(0, 8).map((e, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 12 }}>
              <T variant="caption" style={{ width: 70, fontFamily: font.mono, fontSize: 10.5 }}>
                {relativeDay(e.at, now) === "Today" ? fmtTime(e.at) : relativeDay(e.at, now)}
              </T>
              <T variant="small" style={{ flex: 1, color: color.ink2 }}>
                {e.text}
              </T>
            </View>
          ))
        ) : (
          <T variant="small">Nothing yet. Rate a meal and it shows up here.</T>
        )}
      </Card>
    </View>
  );

  const right = (
    <View style={{ gap: 18 }}>
      {found.length ? (
        <Card padded={false}>
          <View style={{ padding: 18, paddingBottom: 8 }}>
            <SectionHeader title="What Sous has noticed" style={{ marginBottom: 0 }} />
          </View>
          {found.map((f, i) => (
            <View key={f.id}>
              {i ? <Divider inset={18} /> : null}
              <View style={{ paddingHorizontal: 18, paddingVertical: 12, gap: 2 }}>
                <T variant="bodyStrong">{f.title}</T>
                <T variant="small">{f.detail}</T>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <SectionHeader title="Cuisines" style={{ marginBottom: 0 }} />
        {cuisines.length ? (
          cuisines.map(([c, a]) => <Affinity key={c} label={cuisineNames[c]} score={a.score} n={a.n} />)
        ) : (
          <T variant="small">Sous fills this in as you rate meals.</T>
        )}
      </Card>

      {tags.length ? (
        <Card style={{ gap: 12 }}>
          <SectionHeader title="Dish traits" style={{ marginBottom: 0 }} />
          {tags.map(([t, a]) => (
            <Affinity key={t} label={tagNames[t]} score={a.score} n={a.n} />
          ))}
        </Card>
      ) : null}

      {places.length ? (
        <Card style={{ gap: 12 }}>
          <SectionHeader title="Places" style={{ marginBottom: 0 }} />
          {places.slice(0, 6).map(([id, a]) => {
            const r = restaurantById(id);
            return (
              <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <RestaurantMark restaurant={r} size={30} />
                <View style={{ flex: 1 }}>
                  <T variant="smallStrong" style={{ color: color.ink }}>
                    {r.name}
                  </T>
                  <T variant="caption">{plural(a.n, "rating")}</T>
                </View>
                <Pill label={a.score > 0.4 ? "Favourite" : a.score < -0.1 ? "Less likely" : "Neutral"} tone={a.score > 0.4 ? "green" : a.score < -0.1 ? "accent" : "neutral"} />
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 1100, alignSelf: "center" }}>
        <PageHeader title="Taste profile" subtitle={`Learned from ${plural(orders.length, "order")} and ${plural(learned.ratings, "rating")}. Rules are fixed; everything else keeps adapting.`} />
        <View style={{ flexDirection: wide ? "row" : "column", gap: 18, alignItems: "flex-start" }}>
          <View style={{ flex: 1, width: wide ? undefined : "100%" }}>{left}</View>
          <View style={{ flex: 1, width: wide ? undefined : "100%" }}>{right}</View>
        </View>
      </View>
    </ScrollView>
  );
}

/** A diverging bar from -1 (avoid) to 1 (love). */
function Affinity({ label, score, n }: { label: string; score: number; n: number }) {
  const pos = score >= 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <T variant="small" style={{ width: 110, color: color.ink2 }} numberOfLines={1}>
        {label}
      </T>
      <View style={{ flex: 1, flexDirection: "row", height: 6 }}>
        <View style={{ flex: 1, alignItems: "flex-end", backgroundColor: color.sunken, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }}>
          {!pos ? <View style={{ width: `${Math.min(1, -score) * 100}%`, height: 6, backgroundColor: color.accent, borderTopLeftRadius: 3, borderBottomLeftRadius: 3 }} /> : null}
        </View>
        <View style={{ width: 2, backgroundColor: color.lineStrong }} />
        <View style={{ flex: 1, backgroundColor: color.sunken, borderTopRightRadius: 3, borderBottomRightRadius: 3 }}>
          {pos ? <View style={{ width: `${Math.min(1, score) * 100}%`, height: 6, backgroundColor: color.green, borderTopRightRadius: 3, borderBottomRightRadius: 3 }} /> : null}
        </View>
      </View>
      <T variant="caption" style={{ width: 22, textAlign: "right", fontFamily: font.mono, fontSize: 10.5 }}>
        {n}
      </T>
    </View>
  );
}
