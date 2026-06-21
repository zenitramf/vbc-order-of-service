export const seo = ({
  title,
  description,
  keywords,
  image,
}: {
  description?: string;
  image?: string;
  keywords?: string;
  title: string;
}) => {
  const tags = [
    { title },
    { content: description, name: "description" },
    { content: keywords, name: "keywords" },
    { content: title, name: "twitter:title" },
    { content: "website", name: "og:type" },
    { content: title, name: "og:title" },
    { content: description, name: "og:description" },
    ...(image ? [{ content: image, name: "og:image" }] : []),
  ];

  return tags;
};
