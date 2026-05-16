-- 海报可能为 data:image/png;base64,...，远超 TEXT(64KB) 上限，导致入库截断、后台无法预览
ALTER TABLE `SocialGuide` MODIFY `posterImageUrl` LONGTEXT NULL;
