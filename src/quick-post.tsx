import {
  Action,
  ActionPanel,
  Form,
  getPreferenceValues,
  open,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";

interface Preferences {
  cmsBase: string;
  contentType: string;
}

interface FormValues {
  content: string;
  externalLink: string;
  externalImage: string;
  slug: string;
}

export default function QuickPost() {
  const prefs = getPreferenceValues<Preferences>();
  const base = (prefs.cmsBase || "https://cms.kjaymiller.dev").replace(/\/+$/, "");
  const type = (prefs.contentType || "microblog").trim();

  async function handleSubmit(values: FormValues) {
    const content = values.content?.trim();
    const link = values.externalLink?.trim();
    const image = values.externalImage?.trim();
    const slug = values.slug?.trim();

    if (!content && !link) {
      await showToast({ style: Toast.Style.Failure, title: "Add some content or a link first" });
      return;
    }

    const params = new URLSearchParams();
    if (content) params.set("content", content);
    if (link) params.set("url", link); // honored as external_link (back-compat alias)
    if (image) params.set("image_url", image);
    if (slug) params.set("slug", slug);

    const target = `${base}/c/${encodeURIComponent(type)}/new?${params.toString()}`;
    await open(target);
    await showToast({ style: Toast.Style.Success, title: `Opened ${type} composer to publish` });
    await popToRoot();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Composer to Publish" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Fill in what you like, then open the CMS composer prefilled — you review and publish there. Nothing is posted from Raycast." />
      <Form.TextArea id="content" title="Content" placeholder="What's on your mind…" enableMarkdown />
      <Form.TextField id="externalLink" title="External Link" placeholder="https://…" />
      <Form.TextField id="externalImage" title="External Image" placeholder="https://…/image.jpg" />
      <Form.TextField id="slug" title="Slug" placeholder="optional — auto-generated if blank" />
    </Form>
  );
}
