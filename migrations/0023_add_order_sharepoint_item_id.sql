-- Adds the SharePoint driveItem id of the published order PDF.
--
-- Set together with sharepoint_uploaded_at when the PDF lands in SharePoint
-- (Media Ministry/Order of Service/<Year>/). The id is the durable handle
-- used to download the PDF back via Microsoft Graph, so newly published
-- orders no longer need a copy in R2 (pdf_object_key stays for orders whose
-- only copy is in R2 until they are backfilled).
ALTER TABLE orders_of_service ADD COLUMN sharepoint_item_id TEXT;
