import React from "react";
import { useSpace } from "Space/Provider";
import { PageTemplate } from "Page/Template";
import { NestedContent } from "Page/NestedContent";
import { InfiniteContent } from "Page/InfiniteContent";
import { PagedContent } from "Page/PagedContent";
import { PageFooter } from "Page/Footer";
import { useListingContext } from "Listing";
import { ErrorBoundary, useToggle } from "utils";

export const ListingPage = React.memo(({ listingParams, ...props }) => {
  const space = useSpace();
  const { ListingContext, listingData } = useListingContext({ listingParams });
  const [infinite, onToggleInfinite] = useToggle(false);
  const { userId, opId, isChat, name } = listingData;
  const cProps = { ...props, opId, ListingContext, onToggleInfinite };
  let Content = PagedContent;
  if (infinite || isChat) Content = InfiniteContent;
  if (opId) Content = NestedContent;

  return (
    <ListingContext.Provider value={listingData}>
      <PageTemplate
        {...{ ...props, userId, opId, isChat, name, listingParams }}
        meta={space ? space : listingData}
      >
        <ErrorBoundary>
          <Content {...cProps} />
          {infinite || isChat ? null : (
            <React.Fragment>
              <PageFooter />
              <p className="bottommenu debuginfo" key="debuginfo">
                <span className="icon">π</span>
                <span className="content" />
              </p>
            </React.Fragment>
          )}
        </ErrorBoundary>
      </PageTemplate>
    </ListingContext.Provider>
  );
});
