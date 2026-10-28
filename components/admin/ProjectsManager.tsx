"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { Button, Field, Input, Panel, StatusBadge, useToast } from "./ui";

interface P {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published";
}

export function ProjectsManager({ projects, currentId, publicId }: { projects: P[]; currentId: string | null; publicId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const select = async (projectId: string) => {
    try {
      await api("POST", "/api/admin/projects/select", { projectId });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="All projects">
        <ul className="divide-y divide-charcoal/8" role="list">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl text-plum">{p.name || "Untitled"}</p>
                <p className="text-xs text-stone">
                  /{p.slug}
                  {p.id === publicId && " · served publicly"}
                </p>
              </div>
              <StatusBadge status={p.status} />
              {p.id === currentId ? <span className="text-xs text-stone">Editing</span> : <Button size="sm" onClick={() => select(p.id)}>Edit this project</Button>}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="New project">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const { project } = await api<{ project: { id: string } }>("POST", "/api/admin/projects", { name, slug });
              toast.success("Project created");
              await select(project.id);
            } catch (err) {
              toast.error(err);
            }
          }}
        >
          <Field label="Name">
            <Input
              value={name}
              required
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60));
              }}
            />
          </Field>
          <Field label="Slug">
            <Input value={slug} required pattern="[a-z0-9][a-z0-9-]*" onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary">Create project</Button>
        </form>
      </Panel>
    </div>
  );
}
