-- Adds the SharePoint upload flag to orders_of_service.
--
-- Set when the published order PDF has been uploaded to SharePoint
-- (Media Ministry/Order of Service/<Year>/). NULL means not uploaded yet,
-- which is what shows the manual "Send to SharePoint" action.
ALTER TABLE orders_of_service ADD COLUMN sharepoint_uploaded_at TEXT;
