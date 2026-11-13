from models.schemas import language_name


def render_markdown(pack: dict) -> str:
    c = pack["constraints"]
    lines = [
        f"# {pack['title']}",
        "",
        f"**Objective:** {pack['objective']}",
        "",
        "**Success criteria:** " + "; ".join(pack["success_criteria"]),
        "",
        f"**Classroom:** {c['class_size']} learners, {c['lesson_minutes']} min, "
        f"{c['support_minutes']} min one-to-one time, {c['prep_minutes']} min to prepare"
        + ("" if c["has_printer"] else ", no printer")
        + ("" if c["has_devices"] else ", no learner devices")
        + (", noisy venue" if c["noisy_venue"] else ""),
        "",
        "## Lesson flow",
        *[f"- **{p['label']}** ({p['minutes']} min): {p['activity']}" for p in pack["flow"]],
        "",
        "## Support for learners",
    ]
    for l in pack["learners"]:
        lines += ["", f"### {l['name']}" + (f" (learns in {language_name(l['language'])})" if l["language"] != "en" else "")]
        for a in l["adaptations"]:
            lines.append(f"- **{a['strategy']}** ({a['teacher_minutes']} min of your time, {a['prep_minutes']} min prep): "
                         f"{a['instruction']}")
        if l.get("translation") and l["translation"]["status"] != "checked":
            lines.append(f"- _The {language_name(l['language'])} version needs a fluent speaker to check it._")
    if pack["whole_class"]["adaptations"]:
        lines += ["", "### Whole class"]
        lines += [f"- **{a['strategy']}**: {a['instruction']}" for a in pack["whole_class"]["adaptations"]]
    lines += ["", "## Checks", *[f"- {'✓' if ch['passed'] else '✗'} {ch['label']}" for ch in pack["checks"]]]
    if pack["warnings"]:
        lines += ["", "## Needs your attention", *[f"- {w}" for w in pack["warnings"]]]
    lines += ["", "_Prepared by Mothusi. You make the final decisions; review everything before you teach._"]
    return "\n".join(lines)
